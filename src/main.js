/*
 * Second Wave Robo Lift – MoPed Controller
 * Companion module for the Second Wave Motorized Pedestal, controlled through the VISCA over IP Data Box.
 *
 * How it works
 * - The Data Box only understands "drive up", "drive down" and "stop" (VISCA pan/tilt drive commands).
 *   It has no position feedback and does not support presets.
 * - Positions are therefore time based: the lower end stop is the reference (0 s) and a position is
 *   "seconds of travel from the bottom". The module tracks the estimated position while it drives.
 * - For safety the operator is guided through a flow after every start:
 *     check   -> Data Box reachable? short test pulse up/down, operator confirms "it moved"
 *     confirm -> operator drives to the lower end stop and confirms "bottom"
 *     ready   -> all drive and position buttons are enabled
 *   If the Data Box becomes unreachable twice in a row, the flow falls back to "check".
 *
 * Copyright (c) 2026 Schnittpunkt UG – MIT License
 */
const { InstanceBase, InstanceStatus, Regex, runEntrypoint } = require('@companion-module/base')
const { ViscaUdp, CMD, checkHost } = require('./visca')
const { LANGS, makeT } = require('./i18n')
const { getActions } = require('./actions')
const { getFeedbacks } = require('./feedbacks')
const { getPresets } = require('./presets')
const UpgradeScripts = require('./upgrades')
const MODULE_VERSION = require('../package.json').version
// Button labels exposed as variables (lbl_<id>) so presets follow the selected language: [variable id, text key]
const LABEL_KEYS = [
	['stop', 'pre_stop'],
	['top', 'pos_top'],
	['middle', 'pos_middle'],
	['bottom', 'pos_bottom'],
	['custom', 'pos_custom'],
	['check', 'pre_check'],
	['confirm', 'pre_confirm'],
	['reject', 'pre_reject'],
	['databox', 'comp_databox'],
	['controlbox', 'comp_controlbox'],
	['pedestal', 'comp_pedestal'],
	['home', 'pos_ref'],
	['pos', 'pre_position'],
	['fb_moved', 'pre_fb_moved'],
	['fb_nomove', 'pre_fb_nomove'],
	['confirm_bottom', 'pre_confirm_bottom'],
	['sys_up', 'sys_up'],
	['sys_down', 'sys_down'],
]
// Countdown variables (cd_<id>) shown on the position buttons while a timed move is running
const COUNTDOWN_IDS = ['top', 'middle', 'bottom', 'custom', 'home']
// Pause between stop and a move in the opposite direction, so the motor controller can settle (ms)
const PAUSE_MS = 800
const CREDIT = 'Created by Recht schnell! GmbH with Schnittpunkt UG'
// Known lift models with their travel times in seconds. Add further models here.
// travel = bottom -> top, fulltravel = reference run down from an unknown position, reserve = extra time driven into an end stop
const MODELS = {
	model30: { label: 'Second Wave Motorized Pedestal Model 30', travel: 16, fulltravel: 19, reserve: 3 },
}
// Safety limit for a calibration run (seconds): the lift is stopped if "top reached" is not pressed in time
const CALIB_MAX_SECONDS = 40
class RoboLiftInstance extends InstanceBase {
	constructor(internal) {
		super(internal)
		this.visca = new ViscaUdp((level, message) => this.log(level, message))
		this.timers = []
		this.safetyTimer = null
		this.pollTimer = null
		this.confirmTimer = null
		this.state = {
			drive: 'idle',
			posSec: null,
			motion: null,
			target: null,
			phase: null,
			endAt: 0,
			blinkOn: false,
			check: { databox: 'unknown', controlbox: 'unknown', pedestal: 'unknown', time: '' },
			checkRunning: false,
			flow: 'check',
			failCount: 0,
			tick: false,
			rowBlinkUntil: 0,
			checkBlinkUntil: 0,
		}
	}
	/**
	 * Companion lifecycle: called once when the connection starts. The guided flow always starts at "check".
	 */
	async init(config) {
		this.config = config
		this.t = makeT(config.language || 'de')
		this.state.posSec = null
		this.log('info', `Second Wave Robo Lift v${MODULE_VERSION} – ${CREDIT}`)
		this.log('info', makeT(config.language || 'de')('power_order'))
		this.defineAll()
		this.armHintBlink()
		this.startUiTimer()
		await this.connect()
	}
	/**
	 * Companion lifecycle: the user saved the connection settings. Changes of the internally stored "lastpos" are ignored.
	 */
	async configUpdated(config) {
		const withoutPos = (cfg) => JSON.stringify({ ...cfg, lastpos: undefined })
		if (this.config && withoutPos(config) === withoutPos(this.config)) {
			this.config = config
		} else {
			// never leave the lift driving while the connection is being reconfigured
			if (this.state.drive !== 'idle' || this.state.calib) {
				await this.stop()
			}
			this.cancelMoves()
			this.stopProgress()
			this.config = config
			this.t = makeT(config.language || 'de')
			this.defineAll()
			await this.connect()
		}
	}
	/**
	 * Companion lifecycle: stop the lift, clear every timer and close the socket.
	 */
	async destroy() {
		this.cancelMoves()
		this.stopProgress()
		if (this.hintTimer) {
			clearInterval(this.hintTimer)
		}
		this.hintTimer = null
		if (this.uiTimer) {
			clearInterval(this.uiTimer)
		}
		this.uiTimer = null
		if (this.pollTimer) {
			clearInterval(this.pollTimer)
		}
		this.clearRefresh()
		if (this.confirmTimer) {
			clearTimeout(this.confirmTimer)
		}
		try {
			if (this.visca.socket) {
				await this.visca.send(CMD.stop)
			}
		} catch (ignored) {}
		this.visca.close()
	}
	/**
	 * Connection settings. The three travel-time fields are only shown for the model "Custom".
	 */
	getConfigFields() {
		const translate = makeT(this.config?.language || 'de')
		return [
			{
				type: 'static-text',
				id: 'info',
				label: 'Second Wave Robo Lift',
				width: 12,
				value: `${translate('cfg_info')}<br><br><b>${translate('power_order').replace(/\n/g, '<br>')}</b><br><br><small>${CREDIT}</small>`,
			},
			{ type: 'dropdown', id: 'language', label: translate('cfg_language'), width: 4, default: 'de', choices: LANGS },
			{
				type: 'textinput',
				id: 'host',
				label: translate('cfg_host'),
				width: 8,
				default: '192.168.1.8',
				regex: Regex.IP,
			},
			{ type: 'number', id: 'port', label: translate('cfg_port'), width: 4, default: 52381, min: 1, max: 65535 },
			{
				type: 'number',
				id: 'localport',
				label: translate('cfg_localport'),
				width: 4,
				default: 52381,
				min: 0,
				max: 65535,
			},
			{ type: 'number', id: 'address', label: translate('cfg_address'), width: 4, default: 1, min: 1, max: 7 },
			{
				type: 'dropdown',
				id: 'transport',
				label: translate('cfg_transport'),
				width: 6,
				default: 'ip',
				choices: [
					{ id: 'ip', label: translate('cfg_transport_ip') },
					{ id: 'raw', label: translate('cfg_transport_raw') },
				],
			},
			{
				type: 'static-text',
				id: 'model_info',
				label: translate('cfg_model'),
				width: 12,
				value: translate('cfg_model_info'),
			},
			{
				type: 'dropdown',
				id: 'model',
				label: translate('cfg_model'),
				width: 12,
				default: 'model30',
				choices: [
					...Object.entries(MODELS).map(([id, model]) => ({ id, label: model.label })),
					{ id: 'custom', label: translate('model_custom') },
				],
			},
			{
				type: 'number',
				id: 'fulltravel',
				isVisibleExpression: "$(options:model) == 'custom'",
				label: translate('cfg_fulltravel'),
				width: 6,
				default: 19,
				min: 5,
				max: 120,
				step: 0.5,
			},
			{
				type: 'number',
				id: 'travel',
				label: translate('cfg_travel'),
				isVisibleExpression: "$(options:model) == 'custom'",
				width: 6,
				default: 16,
				min: 5,
				max: 120,
				step: 0.5,
			},
			{
				type: 'number',
				id: 'reserve',
				label: translate('cfg_reserve'),
				isVisibleExpression: "$(options:model) == 'custom'",
				width: 6,
				default: 3,
				min: 0,
				max: 10,
				step: 0.5,
			},
			{
				type: 'number',
				id: 'middle',
				label: translate('cfg_middle'),
				width: 6,
				default: 8,
				min: 0.5,
				max: 120,
				step: 0.5,
			},
			{ type: 'number', id: 'maxdrive', label: translate('cfg_maxdrive'), width: 6, default: 40, min: 5, max: 300 },
			{
				type: 'number',
				id: 'testpulse',
				label: translate('cfg_testpulse'),
				width: 6,
				default: 1,
				min: 0.5,
				max: 5,
				step: 0.5,
			},
			{
				type: 'number',
				id: 'pollinterval',
				label: translate('cfg_pollinterval'),
				width: 6,
				default: 30,
				min: 0,
				max: 3600,
			},
		]
	}
	/**
	 * (Re)publish actions, feedbacks, presets and variables – needed again after a language change.
	 */
	defineAll() {
		const translate = this.t
		this.setActionDefinitions(getActions(this))
		this.setFeedbackDefinitions(getFeedbacks(this))
		this.setPresetDefinitions(getPresets(this))
		this.setVariableDefinitions([
			{ variableId: 'drive_status', name: translate('var_status') },
			{ variableId: 'position', name: translate('var_position') },
			{ variableId: 'check_databox', name: translate('var_databox') },
			{ variableId: 'check_controlbox', name: translate('var_controlbox') },
			{ variableId: 'check_pedestal', name: translate('var_pedestal') },
			{ variableId: 'check_time', name: translate('var_check_time') },
			{ variableId: 'check_hint', name: translate('var_check_hint') },
			{ variableId: 'module_version', name: translate('var_version') },
			{ variableId: 'power_order', name: translate('var_power_order') },
			{ variableId: 'credit', name: translate('var_credit') },
			...LABEL_KEYS.map(([id, textKey]) => ({
				variableId: `lbl_${id}`,
				name: `${translate('vn_label')}: ${translate(textKey).replace(/\n/g, ' ')}`,
			})),
			...COUNTDOWN_IDS.map((id) => ({
				variableId: `cd_${id}`,
				name: `${translate('vn_countdown')}: ${translate(id === 'home' ? 'pos_ref' : `pos_${id}`)}`,
			})),
			{ variableId: 'sym_databox', name: `${translate('vn_symbol')}: ${translate('comp_databox')}` },
			{ variableId: 'sym_controlbox', name: `${translate('vn_symbol')}: ${translate('comp_controlbox')}` },
			{ variableId: 'sym_pedestal', name: `${translate('vn_symbol')}: ${translate('comp_pedestal')}` },
			{ variableId: 'flow', name: translate('var_flow') },
			{ variableId: 'next_step', name: translate('step_title') },
			{ variableId: 'databox_reach', name: translate('var_databox_reach') },
			{ variableId: 'calib_status', name: translate('var_calib_status') },
		])
		this.updateVariables()
	}
	/**
	 * Translated text for a check state (unknown, checking, ok, fail, wait, unconfirmed, noreply).
	 */
	stateText(state) {
		return this.t(
			{
				unknown: 'st_unknown',
				checking: 'st_checking',
				ok: 'st_ok',
				fail: 'st_fail',
				wait: 'st_wait',
				unconfirmed: 'st_unconfirmed',
				noreply: 'st_noreply',
			}[state] || 'st_unknown',
		)
	}
	/**
	 * Recalculate all variable values (position text, countdowns, check results, labels) and refresh the feedbacks.
	 */
	updateVariables() {
		const translate = this.t
		const check = this.state.check
		const arrow = this.state.drive === 'up' ? '↑' : '↓'
		const secondsLeft = Math.max(0, Math.ceil((this.state.endAt - Date.now()) / 1000))
		let positionText
		if (this.state.target) {
			// timed move running: direction, target name and countdown
			const targetText = this.state.phase === 'ref' ? translate('pos_ref') : translate(`pos_${this.state.target}`)
			positionText = `${arrow} ${targetText} ${secondsLeft} s`
		} else if (this.state.drive !== 'idle') {
			positionText = translate('pos_moving')
		} else {
			const label = this.posLabel()
			if (label === 'custom') {
				positionText = `≈ ${Math.round(this.state.posSec)} s`
			} else if (label !== 'unknown') {
				positionText = translate(`pos_${label}`)
			} else if (this.state.flow === 'check') {
				positionText = translate('pos_flow_check')
			} else if (this.state.flow === 'confirm') {
				positionText = translate('pos_flow_confirm')
			} else {
				positionText = translate('pos_need_ref')
			}
		}
		const countdowns = Object.fromEntries(COUNTDOWN_IDS.map((id) => [`cd_${id}`, '']))
		if (this.state.target) {
			const text = `${arrow} ${secondsLeft} s`
			countdowns[`cd_${this.state.target}`] = text
			if (this.state.phase === 'ref') {
				countdowns.cd_home = text
			}
		}
		const symbol = (state) => (state === 'ok' ? '✔' : state === 'fail' ? '✘' : state === 'checking' ? '…' : '?')
		this.setVariableValues({
			...countdowns,
			sym_databox: symbol(check.databox),
			sym_controlbox: symbol(check.controlbox),
			sym_pedestal: symbol(check.pedestal),
			flow: this.state.flow,
			next_step: `${translate('step_title')}:\n${translate(this.nextStepKey())}`,
			databox_reach: translate(
				{ ok: 'reach_ok', fail: 'reach_fail', noreply: 'reach_noreply' }[check.databox] || 'reach_unknown',
			),
			drive_status: translate({ idle: 'st_idle', up: 'st_up', down: 'st_down' }[this.state.drive]),
			position: positionText,
			check_databox: this.stateText(check.databox),
			check_controlbox: this.stateText(check.controlbox),
			check_pedestal: this.stateText(check.pedestal),
			check_time: check.time,
			check_hint: check.hint ? translate(check.hint) : '',
			module_version: `v${MODULE_VERSION}`,
			power_order: translate('power_order'),
			credit: CREDIT,
			calib_status: this.calibStatusText(),
			...Object.fromEntries(LABEL_KEYS.map(([id, textKey]) => [`lbl_${id}`, translate(textKey)])),
		})
		this.checkFeedbacks()
	}
	/**
	 * Open the UDP socket and start the periodic reachability check of the Data Box.
	 */
	async connect() {
		if (this.pollTimer) {
			clearInterval(this.pollTimer)
		}
		this.pollTimer = null
		if (!this.config.host) {
			this.updateStatus(InstanceStatus.BadConfig, this.t('st_no_ip'))
			return
		}
		try {
			await this.visca.open(this.config)
			this.updateStatus(InstanceStatus.Ok)
		} catch (err) {
			this.updateStatus(InstanceStatus.ConnectionFailure, err.message)
			return
		}
		const pollSeconds = Number(this.config.pollinterval) || 0
		if (pollSeconds > 0) {
			this.pingDataBox(true)
			this.pollTimer = setInterval(() => this.pingDataBox(true), 1000 * pollSeconds)
		}
	}
	/**
	 * Send one VISCA command (hex string). Errors are logged and shown as connection status, never thrown.
	 */
	async send(hex) {
		try {
			const sentHex = await this.visca.send(hex)
			this.log('debug', `${this.t('log_sent')}: ${sentHex}`)
		} catch (err) {
			this.log('error', err.message)
			this.updateStatus(InstanceStatus.UnknownError, err.message)
		}
	}
	/**
	 * Send a drive/stop command twice (150 ms apart, UDP is unacknowledged) unless a newer command has been issued meanwhile.
	 * While driving, the command is repeated every 2 s (see armRefresh).
	 */
	async sendMove(cmd) {
		const seq = (this.sendSeq = (this.sendSeq || 0) + 1)
		if (cmd === CMD.stop) {
			this.clearRefresh()
		}
		await this.send(cmd)
		if (cmd === CMD.stop) {
			this.endMotion()
		}
		await new Promise((resolve) => setTimeout(resolve, 150))
		if (seq === this.sendSeq) {
			await this.send(cmd)
			if (cmd !== CMD.stop && seq === this.sendSeq) {
				this.armRefresh(cmd)
			}
		}
	}
	clearRefresh() {
		if (this.refreshTimer) {
			clearInterval(this.refreshTimer)
		}
		this.refreshTimer = null
	}
	/**
	 * Repeat the active drive command every 2 s for as long as the lift is meant to move in that direction.
	 */
	armRefresh(cmd) {
		this.clearRefresh()
		const timer = setInterval(() => {
			const current = this.state.drive === 'up' ? CMD.up : this.state.drive === 'down' ? CMD.down : null
			if (this.refreshTimer === timer && current === cmd) {
				this.send(cmd)
			} else {
				clearInterval(timer)
			}
		}, 2000)
		this.refreshTimer = timer
	}
	/**
	 * Run a promise in the background and log a failure instead of leaving it unhandled.
	 */
	bg(promise) {
		Promise.resolve(promise).catch((err) => this.log('error', err?.message || String(err)))
	}
	/**
	 * Abort every pending timed step: bumps moveId (so running sequences notice), resolves all waits with false and clears the safety timer.
	 * It does NOT send a stop command – callers do that.
	 */
	cancelMoves() {
		this.moveId = (this.moveId || 0) + 1
		this.timers.forEach((entry) => {
			clearTimeout(entry.h)
			entry.resolve(false)
		})
		this.timers = []
		if (this.safetyTimer) {
			clearTimeout(this.safetyTimer)
		}
		this.safetyTimer = null
	}
	/**
	 * Cancellable wait. Resolves true after ms, or false as soon as cancelMoves() is called.
	 */
	later(ms) {
		return new Promise((resolve) => {
			const entry = { resolve }
			entry.h = setTimeout(() => {
				this.timers = this.timers.filter((other) => other !== entry)
				resolve(true)
			}, ms)
			this.timers.push(entry)
		})
	}
	/**
	 * Travel times of the selected model, or null for "Custom" (then the values from the settings apply).
	 */
	modelTimes() {
		return MODELS[this.config.model] || null
	}
	/**
	 * Seconds from the lower to the upper end stop.
	 */
	travel() {
		return this.modelTimes()?.travel || Number(this.config.travel) || 16
	}
	/**
	 * Extra seconds driven into an end stop to make sure it is really reached.
	 */
	reserve() {
		const model = this.modelTimes()
		return model ? model.reserve : Number(this.config.reserve) || 3
	}
	/**
	 * Duration of the reference run down when the position is unknown.
	 */
	fullTravel() {
		return this.modelTimes()?.fulltravel || Number(this.config.fulltravel) || this.travel() + this.reserve()
	}
	/**
	 * Start tracking a movement for the position estimate.
	 */
	beginMotion(dir) {
		this.endMotion(false)
		this.state.motion = { dir, t0: Date.now() }
	}
	/**
	 * Finish tracking: add/subtract the elapsed time to the estimated position (clamped to 0 … travel).
	 */
	endMotion(save = true) {
		const motion = this.state.motion
		if (!motion) return
		this.state.motion = null
		if (this.state.posSec == null) return
		const elapsed = (Date.now() - motion.t0) / 1000
		this.state.posSec = Math.min(
			this.travel(),
			Math.max(0, this.state.posSec + (motion.dir === 'up' ? elapsed : -elapsed)),
		)
		if (save) {
			this.savePos()
		}
	}
	setPos(seconds) {
		this.state.posSec = seconds
		this.savePos()
		this.armHintBlink()
	}
	/**
	 * Store the estimated position in the connection config (rounded to 0.1 s).
	 */
	savePos() {
		const rounded = this.state.posSec == null ? null : Math.round(10 * this.state.posSec) / 10
		if (this.config.lastpos !== rounded) {
			this.config = { ...this.config, lastpos: rounded }
			try {
				this.saveConfig(this.config)
			} catch (ignored) {}
		}
	}
	/**
	 * Named position for the current estimate: unknown, bottom, top, middle or custom.
	 */
	posLabel() {
		const pos = this.state.posSec
		if (pos == null) return 'unknown'
		if (pos <= 0.3) return 'bottom'
		if (pos >= this.travel() - 0.3) return 'top'
		if (Math.abs(pos - (Number(this.config.middle) || 8)) <= 0.5) return 'middle'
		return 'custom'
	}
	/**
	 * Show a running timed move (countdown + blinking button) for the given target.
	 */
	startProgress(target, phase, durationMs) {
		this.state.target = target
		this.state.phase = phase
		this.state.endAt = Date.now() + durationMs
		if (!this.progressTimer) {
			this.progressTimer = setInterval(() => {
				this.state.blinkOn = !this.state.blinkOn
				this.updateVariables()
			}, 500)
		}
		this.updateVariables()
	}
	stopProgress() {
		if (this.progressTimer) {
			clearInterval(this.progressTimer)
		}
		this.progressTimer = null
		this.state.target = null
		this.state.phase = null
		this.state.blinkOn = false
		this.armHintBlink()
	}
	/**
	 * Blink the "reference needed" hint while the position is unknown and no move is running.
	 */
	armHintBlink() {
		const needRef = this.state.posSec == null && !this.state.target
		if (needRef && !this.hintTimer) {
			this.hintTimer = setInterval(() => {
				this.state.hintOn = !this.state.hintOn
				this.checkFeedbacks('need_ref')
			}, 700)
		} else if (!needRef && this.hintTimer) {
			clearInterval(this.hintTimer)
			this.hintTimer = null
			this.state.hintOn = false
			this.checkFeedbacks('need_ref')
		}
	}
	/**
	 * Manual drive (hold-to-run buttons). Reversing first stops and pauses. A safety timer stops the lift after "maxdrive" seconds.
	 */
	async drive(dir, { manual = true } = {}) {
		const reversing = this.state.drive !== 'idle' && this.state.drive !== dir
		if (manual) {
			this.cancelMoves()
			this.stopProgress()
		}
		if (reversing) {
			await this.sendMove(CMD.stop)
			this.endMotion()
			this.state.drive = 'idle'
			await new Promise((resolve) => setTimeout(resolve, PAUSE_MS))
		}
		this.state.drive = dir
		this.beginMotion(dir)
		this.updateVariables()
		await this.sendMove(dir === 'up' ? CMD.up : CMD.down)
		// stopped or redirected while the command was being sent: do not arm a stale safety timer
		if (this.state.drive !== dir) return
		if (this.safetyTimer) {
			clearTimeout(this.safetyTimer)
		}
		this.safetyTimer = setTimeout(
			() => {
				this.log('warn', this.t('log_safety'))
				this.bg(this.stop())
			},
			1000 * (Number(this.config.maxdrive) || 40),
		)
	}
	/**
	 * Stop immediately: aborts timed moves and a running calibration.
	 */
	async stop() {
		if (this.state.calib) {
			this.state.calib = null
			this.log('warn', this.t('log_calib_cancel'))
		}
		this.cancelMoves()
		this.stopProgress()
		await this.sendMove(CMD.stop)
		this.endMotion()
		this.state.drive = 'idle'
		this.updateVariables()
	}
	/**
	 * Reference run to the lower end stop.
	 */
	async home() {
		return this.goTo('bottom', 0, { forceHome: true })
	}
	/**
	 * Timed move to top, middle, bottom or a custom position (seconds from the bottom).
	 * Unknown position: first a reference run down (fullTravel seconds), then up for the required time.
	 * Known position: drive only the difference. Moves into an end stop are extended by the reserve.
	 */
	async goTo(target, customSeconds, { forceHome = false } = {}) {
		if (this.state.target === target && this.state.drive !== 'idle' && !forceHome) {
			this.log('info', this.t('log_ignored'))
			return
		}
		const wasMoving = this.state.drive !== 'idle'
		this.cancelMoves()
		this.stopProgress()
		const moveId = this.moveId
		if (wasMoving) {
			await this.sendMove(CMD.stop)
			this.endMotion()
			this.state.drive = 'idle'
			if (!(await this.later(PAUSE_MS))) return
		}
		const travel = this.travel()
		const reserve = this.reserve()
		// one timed leg of the move; resolves false when it was cancelled
		const run = async (dir, seconds, phase) => {
			if (moveId !== this.moveId) return false
			this.state.drive = dir
			this.beginMotion(dir)
			this.startProgress(target, phase, 1000 * seconds)
			const startedAt = Date.now()
			await this.sendMove(dir === 'up' ? CMD.up : CMD.down)
			// wait for the remaining time; false = cancelled (whoever cancelled sends the stop command)
			const completed = await this.later(Math.max(0, 1000 * seconds - (Date.now() - startedAt)))
			if (!completed) return false
			await this.sendMove(CMD.stop)
			this.endMotion(false)
			this.state.drive = 'idle'
			return true
		}
		let ok = true
		if (this.state.posSec == null || forceHome) {
			// reference run: drive down long enough to reach the lower end stop from anywhere
			const refSeconds = this.fullTravel()
			ok = await run('down', refSeconds, 'ref')
			if (!ok) return
			this.setPos(0)
			if (target === 'bottom') {
				this.stopProgress()
				this.updateVariables()
				return
			}
			ok = await this.later(PAUSE_MS)
			if (!ok) return
		}
		const current = this.state.posSec
		const goal =
			target === 'bottom'
				? 0
				: target === 'top'
					? travel
					: target === 'middle'
						? Math.min(travel, Number(this.config.middle) || 8)
						: Math.min(travel, Math.max(0, Number(customSeconds) || 0))
		if ((target === 'bottom' && current <= 0.3) || (target === 'top' && current >= travel - 0.3)) {
			this.log('info', `${this.t('log_already')}: ${this.t(`pos_${target}`)}`)
		} else if (target === 'bottom') {
			ok = await run('down', current + reserve, 'move')
		} else if (target === 'top') {
			ok = await run('up', travel - current + reserve, 'move')
		} else if (Math.abs(goal - current) > 0.2) {
			ok = await run(goal > current ? 'up' : 'down', Math.abs(goal - current), 'move')
		}
		if (ok) {
			if (target === 'bottom' || target === 'top') {
				this.setPos(goal)
			} else {
				this.savePos()
			}
			this.stopProgress()
			this.updateVariables()
		}
	}
	/**
	 * Reachability check of the Data Box (TCP/UDP probe, see visca.js). Results: ok, noreply (host alive, no answer) or fail.
	 * Two consecutive failures outside the "check" phase reset the guided flow.
	 */
	async pingDataBox(silent = false) {
		if (!silent) {
			this.state.check.databox = 'checking'
			this.updateVariables()
		}
		const result = await checkHost(this.config.host, this.config.port)
		const status = result.ok ? 'ok' : result.hard ? 'fail' : 'noreply'
		const check = this.state.check
		const previous = check.databox
		this.state.failCount = status === 'fail' ? this.state.failCount + 1 : 0
		if (this.state.failCount >= 2 && this.state.flow !== 'check') {
			this.loseChecks()
		}
		// a confirmed, working Data Box is not downgraded just because a probe got no answer
		if (!(status === 'noreply' && check.databox === 'ok' && check.databoxConfirmed)) {
			check.databox = status
		}
		if (status === 'fail') {
			check.hint = 'hint_databox'
			check.databoxConfirmed = false
		} else if (check.hint === 'hint_databox') {
			check.hint = ''
		}
		// Data Box just became reachable during the check phase: let the check button blink for 4 s
		const becameReachable = previous === 'unknown' || previous === 'fail' || previous === 'checking'
		if (this.state.flow === 'check' && status !== 'fail' && becameReachable) {
			this.state.checkBlinkUntil = Date.now() + 4000
		}
		if (!silent) {
			this.log(status === 'fail' ? 'warn' : 'info', `Data Box ${this.config.host}: ${status} (${result.reason})`)
		}
		if (status === 'fail') {
			this.updateStatus(InstanceStatus.ConnectionFailure, `Data Box ${this.config.host}: ${result.reason}`)
		} else if (check.databox === 'noreply') {
			this.updateStatus(InstanceStatus.Ok, this.t('st_noreply'))
		} else {
			this.updateStatus(InstanceStatus.Ok)
		}
		this.updateVariables()
		return status
	}
	/**
	 * System check, step 1 of the guided flow: probe the Data Box, then a short test pulse up and down.
	 * The operator afterwards reports whether the lift moved (answerCheck).
	 */
	async startCheck() {
		if (this.state.checkRunning) return
		this.state.checkRunning = true
		const check = this.state.check
		check.controlbox = 'unknown'
		check.pedestal = 'unknown'
		check.hint = ''
		check.time = new Date().toLocaleString(
			this.config.language === 'en' ? 'en-GB' : this.config.language === 'es' ? 'es-ES' : 'de-DE',
		)
		if ((await this.pingDataBox(false)) === 'fail') {
			check.controlbox = 'unknown'
			check.pedestal = 'unknown'
			check.hint = 'hint_databox'
			this.state.checkRunning = false
			this.updateVariables()
			return
		}
		check.controlbox = 'checking'
		check.pedestal = 'checking'
		this.updateVariables()
		const pulseMs = 1000 * (Number(this.config.testpulse) || 1)
		this.cancelMoves()
		this.stopProgress()
		this.beginMotion('up')
		let startedAt = Date.now()
		await this.sendMove(CMD.up)
		let ok = await this.later(Math.max(0, pulseMs - (Date.now() - startedAt)))
		await this.sendMove(CMD.stop)
		this.endMotion()
		if (ok) {
			ok = await this.later(PAUSE_MS)
		}
		if (ok) {
			this.beginMotion('down')
			startedAt = Date.now()
			await this.sendMove(CMD.down)
			ok = await this.later(Math.max(0, pulseMs - (Date.now() - startedAt)))
			await this.sendMove(CMD.stop)
			this.endMotion()
		}
		this.state.drive = 'idle'
		check.controlbox = 'wait'
		check.pedestal = 'wait'
		this.state.checkRunning = false
		this.updateVariables()
		if (this.confirmTimer) {
			clearTimeout(this.confirmTimer)
		}
		this.confirmTimer = setTimeout(() => {
			if (check.pedestal === 'wait') {
				check.controlbox = 'unconfirmed'
				check.pedestal = 'unconfirmed'
				check.hint = 'hint_unconfirmed'
				this.updateVariables()
			}
		}, 60000)
	}
	/**
	 * Operator feedback after the test pulse. "Moved" unlocks the next phase ("confirm").
	 */
	answerCheck(moved) {
		const check = this.state.check
		if (this.state.flow === 'check') {
			if (this.confirmTimer) {
				clearTimeout(this.confirmTimer)
			}
			check.controlbox = moved ? 'ok' : 'fail'
			check.pedestal = moved ? 'ok' : 'fail'
			if (moved) {
				check.databox = 'ok'
				check.databoxConfirmed = true
			}
			check.hint = moved ? 'hint_ok' : check.databox === 'noreply' ? 'hint_noreply' : 'hint_nomove'
			if (!moved && check.databox === 'noreply') {
				this.log('warn', this.t('hint_nomove'))
			}
			this.log(moved ? 'info' : 'warn', this.t(check.hint))
			if (moved) {
				this.state.rowBlinkUntil = Date.now() + 2400
				this.state.checkBlinkUntil = 0
				this.state.flow = 'confirm'
				this.log('info', this.t('log_flow_confirm'))
			}
			this.updateVariables()
		}
	}
	/**
	 * Whether the "start check" button should currently blink (invites the operator to start the check).
	 */
	checkBlinkOn() {
		const state = this.state
		const check = state.check
		if (state.flow !== 'check' || state.checkRunning || check.databox === 'fail' || check.databox === 'unknown')
			return false
		if (check.pedestal === 'wait' || check.pedestal === 'unconfirmed' || check.pedestal === 'ok') return false
		const phase = Date.now() % 7000
		return phase < 4000 && Math.floor(phase / 400) % 2 == 0
	}
	/**
	 * Text key of the hint shown on the "next step" button.
	 */
	nextStepKey() {
		const state = this.state
		const check = state.check
		if (state.drive !== 'idle' || state.checkRunning) return 'step_moving'
		if (state.flow === 'check') {
			if (check.databox === 'fail') return 'step_box_fail'
			if (check.pedestal === 'fail') return 'step_nomove'
			if (check.pedestal === 'wait' || check.pedestal === 'unconfirmed') return 'step_answer'
			return 'step_check'
		}
		if (state.flow === 'confirm') return this.posLabel() === 'bottom' ? 'step_confirm' : 'step_down'
		return 'step_ready'
	}
	/**
	 * Which button groups are enabled in the current phase of the guided flow.
	 */
	allowed(group) {
		const flow = this.state.flow
		switch (group) {
			case 'stop':
				return true
			case 'check':
				return flow === 'check'
			case 'bottom':
			case 'down':
				return flow === 'confirm' || flow === 'ready'
			case 'confirm':
				return flow === 'confirm'
			default:
				return flow === 'ready'
		}
	}
	/**
	 * Like allowed(), but logs a hint when the action is locked.
	 */
	guard(group) {
		if (this.allowed(group)) return true
		this.log('info', this.t('log_locked'))
		return false
	}
	/**
	 * Operator confirms that the lift stands on the lower end stop: position = 0, flow = "ready".
	 */
	confirmBottom() {
		if (this.guard('confirm')) {
			this.cancelMoves()
			this.stopProgress()
			this.setPos(0)
			this.state.flow = 'ready'
			this.log('info', this.t('log_flow_ready'))
			this.updateVariables()
		}
	}
	/**
	 * Fall back to the "check" phase (Data Box lost or flow restarted): stop, forget the position.
	 */
	loseChecks() {
		const check = this.state.check
		this.log('warn', this.t('log_flow_lost'))
		if (this.state.drive !== 'idle') {
			this.bg(this.stop())
		}
		this.state.flow = 'check'
		this.state.posSec = null
		check.controlbox = 'unknown'
		check.pedestal = 'unknown'
		check.databoxConfirmed = false
		this.state.rowBlinkUntil = 0
		this.updateVariables()
	}
	restartFlow() {
		this.state.failCount = 2
		this.loseChecks()
		this.state.failCount = 0
		this.bg(this.pingDataBox(false))
	}
	/**
	 * Calibration, step 1: the lift must stand at the bottom. It drives up until the operator presses "top reached"
	 * (finishCalibration) or the safety limit CALIB_MAX_SECONDS is hit.
	 */
	async startCalibration() {
		if (this.state.calib) return
		if (this.state.drive !== 'idle' || this.posLabel() !== 'bottom') {
			this.log('warn', this.t('log_calib_need_bottom'))
			return
		}
		this.cancelMoves()
		this.stopProgress()
		this.state.calib = { startedAt: Date.now() }
		this.state.drive = 'up'
		this.beginMotion('up')
		this.log('info', this.t('log_calib_started'))
		this.updateVariables()
		await this.sendMove(CMD.up)
		// cancelled (Stop) while the command was being sent
		if (!this.state.calib) return
		if (this.safetyTimer) {
			clearTimeout(this.safetyTimer)
		}
		this.safetyTimer = setTimeout(() => {
			this.log('warn', this.t('log_calib_timeout'))
			this.bg(this.stop())
		}, 1000 * CALIB_MAX_SECONDS)
	}
	/**
	 * Calibration, step 2: operator pressed "top reached". The measured time becomes the travel time (model "Custom").
	 */
	async finishCalibration() {
		const calib = this.state.calib
		if (!calib) {
			this.log('info', this.t('log_calib_not_running'))
			return
		}
		const measured = Math.round(((Date.now() - calib.startedAt) / 1000) * 2) / 2
		this.state.calib = null
		if (this.safetyTimer) {
			clearTimeout(this.safetyTimer)
		}
		this.safetyTimer = null
		// the position is set from the measurement below, so the motion tracker is not needed here
		this.state.motion = null
		await this.sendMove(CMD.stop)
		this.state.drive = 'idle'
		const reserve = this.reserve()
		const fulltravel = Math.ceil(measured + reserve)
		this.config = {
			...this.config,
			model: 'custom',
			travel: measured,
			reserve,
			fulltravel,
		}
		try {
			this.saveConfig(this.config)
		} catch (ignored) {}
		this.setPos(measured)
		this.log('info', `${this.t('log_calib_done')}: ${measured} s`)
		this.updateVariables()
	}
	/**
	 * Store the current estimated position as the "middle" position (rounded to 0.5 s).
	 */
	saveMiddle() {
		const pos = this.state.posSec
		if (this.state.drive !== 'idle' || pos == null) {
			this.log('warn', this.t('log_mid_need_pos'))
			return
		}
		const middle = Math.max(0.5, Math.round(pos * 2) / 2)
		this.config = { ...this.config, middle }
		try {
			this.saveConfig(this.config)
		} catch (ignored) {}
		this.log('info', `${this.t('log_mid_saved')}: ${middle} s`)
		this.updateVariables()
	}
	calibStatusText() {
		if (this.state.calib)
			return `${this.t('calib_running')}\n${Math.round((Date.now() - this.state.calib.startedAt) / 1000)} s`
		const model = this.modelTimes()
		return `${model ? model.label.replace('Second Wave Motorized Pedestal ', '') : this.t('model_custom')}\n${this.travel()} s`
	}
	/**
	 * 400 ms tick for blinking feedbacks and the running calibration timer.
	 */
	startUiTimer() {
		if (!this.uiTimer) {
			this.uiTimer = setInterval(() => {
				this.state.tick = !this.state.tick
				this.checkFeedbacks('blink', 'dim', 'component_state', 'calibrating')
				if (this.state.calib) {
					this.updateVariables()
				}
			}, 400)
		}
	}
}

runEntrypoint(RoboLiftInstance, UpgradeScripts)
