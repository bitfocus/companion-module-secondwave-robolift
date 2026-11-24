/*
 * Second Wave Robo Lift – MoPed Controller
 * VISCA over IP transport for the Data Box.
 *
 * - Commands are sent as UDP datagrams, by default with the 8-byte "VISCA over IP" header
 *   (payload type 0x0100, payload length, sequence number); "raw" sends the bare VISCA bytes.
 * - The socket is deliberately NOT connect()ed: the Data Box may answer from a different source port,
 *   and a connected UDP socket would silently drop those datagrams.
 * - The Data Box does not acknowledge commands reliably, so reachability is checked separately (checkHost).
 * Copyright (c) 2026 Schnittpunkt UG – MIT License
 */
const dgram = require('dgram')
const net = require('net')
/** Parse a hex string such as "81 01 06 01 FF"; returns null if it is not valid hex. */
function hexToBuffer(hex) {
	const clean = String(hex).replace(/[^0-9a-fA-F]/g, '')
	return clean.length === 0 || clean.length % 2 != 0 ? null : Buffer.from(clean, 'hex')
}
/**
 * TCP probe. The Data Box offers no TCP service, so "connection refused" also proves that the host is alive.
 */
function probeHost(host, port, timeoutMs = 2500) {
	return new Promise((resolve) => {
		const socket = new net.Socket()
		let done = false
		const finish = (ok, reason) => {
			if (!done) {
				done = true
				socket.destroy()
				resolve({ ok, reason })
			}
		}
		socket.setTimeout(timeoutMs)
		socket.once('connect', () => finish(true, 'connect'))
		socket.once('timeout', () => finish(false, 'timeout'))
		socket.once('error', (err) => finish(err.code === 'ECONNREFUSED', err.code || err.message))
		socket.connect(Number(port), host)
	})
}
/**
 * UDP probe (default: discard port 9). An ICMP "port unreachable" (ECONNREFUSED/ECONNRESET) or any reply
 * shows that the host is alive; silence means "no reply".
 */
function udpProbe(host, port = 9, timeoutMs = 2000) {
	return new Promise((resolve) => {
		let socket
		let done = false
		const finish = (ok, reason) => {
			if (!done) {
				done = true
				clearTimeout(timer)
				try {
					socket.close()
				} catch (ignored) {}
				resolve({ ok, reason })
			}
		}
		const timer = setTimeout(() => finish(false, 'udp timeout'), timeoutMs)
		try {
			socket = dgram.createSocket('udp4')
			socket.on('error', (err) =>
				finish(err.code === 'ECONNREFUSED' || err.code === 'ECONNRESET', err.code || err.message),
			)
			socket.on('message', () => finish(true, 'udp reply'))
			socket.connect(Number(port), host, () => {
				const ping = () =>
					!done && socket.send(Buffer.from([0]), (err) => err && finish(false, err.code || err.message))
				ping()
				setTimeout(ping, 400)
				setTimeout(ping, 900)
			})
		} catch (err) {
			finish(false, err.code || err.message)
		}
	})
}
module.exports = {
	ViscaUdp: class {
		constructor(logFn) {
			this.log = logFn
			this.socket = null
			this.seq = 1
			this.cfg = null
		}
		/** Bind the local UDP port (0 = any) and, for VISCA over IP, reset the sequence number of the Data Box. */
		open(cfg) {
			this.close()
			this.cfg = cfg
			this.seq = 1
			return new Promise((resolve, reject) => {
				const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true })
				socket.on('error', (err) => this.log('error', `UDP: ${err.message}`))
				socket.on('message', (msg, rinfo) =>
					this.log('debug', `Received from ${rinfo.address}:${rinfo.port}: ${msg.toString('hex')}`),
				)
				socket.bind(Number(cfg.localport) || 0, () => {
					this.socket = socket
					if (cfg.transport === 'ip') {
						// VISCA over IP control command "RESET sequence number" (payload type 0x0200, payload 0x01)
						this._sendRaw(Buffer.from([2, 0, 0, 1, 0, 0, 0, 0, 1])).catch(() => {})
					}
					resolve()
				})
				socket.once('error', reject)
			})
		}
		close() {
			if (this.socket)
				try {
					this.socket.close()
				} catch (ignored) {}
			this.socket = null
		}
		_sendRaw(data) {
			return new Promise((resolve, reject) => {
				if (!this.socket || !this.cfg) return reject(new Error('socket not open'))
				this.socket.send(data, Number(this.cfg.port), this.cfg.host, (err) => (err ? reject(err) : resolve()))
			})
		}
		/** Send one VISCA command given as hex string; resolves with the hex of the datagram actually sent. */
		send(hex) {
			let payload = hexToBuffer(hex)
			if (!payload) return Promise.reject(new Error(`invalid hex: ${hex}`))
			// patch the configured device address into the VISCA header byte (0x8n); broadcast (0x88) stays untouched
			const address = Number(this.cfg?.address) || 1
			if (payload.length > 0 && (payload[0] & 0xf0) === 0x80 && payload[0] !== 0x88) {
				payload[0] = 0x80 | (address & 7)
			}
			let packet = payload
			if (this.cfg.transport === 'ip') {
				// VISCA over IP header: payload type 0x0100 (command), payload length, sequence number
				const header = Buffer.alloc(8)
				header.writeUInt16BE(0x0100, 0)
				header.writeUInt16BE(payload.length, 2)
				header.writeUInt32BE(this.seq >>> 0, 4)
				this.seq = (this.seq + 1) >>> 0
				packet = Buffer.concat([header, payload])
			}
			return this._sendRaw(packet).then(() => packet.toString('hex'))
		}
	},
	// VISCA pan/tilt drive commands understood by the Data Box (address byte is patched in send())
	CMD: {
		up: '81 01 06 01 0A 0A 03 01 FF',
		down: '81 01 06 01 0A 0A 03 02 FF',
		stop: '81 01 06 01 0A 0A 03 03 FF',
	},
	probeHost,
	udpProbe,
	/**
	 * Combined reachability check: { ok } when the host answers, otherwise { ok: false, hard } where
	 * hard = true means the network says the host cannot be reached at all.
	 */
	checkHost: async function (host, port) {
		try {
			const tcp = await probeHost(host, port)
			if (tcp.ok) return tcp
			const udp = await udpProbe(host)
			return udp.ok
				? udp
				: {
						ok: false,
						hard: /EHOSTUNREACH|ENETUNREACH|ENETDOWN|EADDRNOTAVAIL|EHOSTDOWN/.test(`${tcp.reason} ${udp.reason}`),
						reason: `tcp ${tcp.reason} / ${udp.reason}`,
					}
		} catch (err) {
			return { ok: false, hard: true, reason: err.code || err.message }
		}
	},
	hexToBuffer,
}
