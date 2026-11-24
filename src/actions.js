/*
 * Second Wave Robo Lift – MoPed Controller
 * Action definitions. Every drive action is guarded by the guided flow (instance.guard), see main.js.
 * Copyright (c) 2026 Schnittpunkt UG – MIT License
 */
const { hexToBuffer } = require('./visca')
module.exports = {
	getActions: function (instance) {
		const translate = instance.t
		return {
			up: { name: translate('act_up'), options: [], callback: () => instance.guard('drive') && instance.drive('up') },
			down: {
				name: translate('act_down'),
				options: [],
				callback: () => instance.guard('down') && instance.drive('down'),
			},
			stop: { name: translate('act_stop'), options: [], callback: () => instance.stop() },
			position: {
				name: translate('act_position'),
				options: [
					{
						type: 'dropdown',
						id: 'target',
						label: translate('opt_position'),
						default: 'bottom',
						choices: [
							{ id: 'top', label: translate('pos_top') },
							{ id: 'middle', label: translate('pos_middle') },
							{ id: 'bottom', label: translate('pos_bottom') },
						],
					},
				],
				callback: (action) => {
					const guardKey = action.options.target === 'bottom' ? 'bottom' : 'pos'
					if (instance.guard(guardKey)) {
						instance.bg(instance.goTo(action.options.target))
					}
				},
			},
			custom_position: {
				name: translate('act_custom'),
				options: [
					{ type: 'number', id: 'seconds', label: translate('opt_seconds'), default: 16, min: 0, max: 120, step: 0.5 },
				],
				callback: (action) => {
					if (instance.guard('pos')) {
						instance.bg(instance.goTo('custom', action.options.seconds))
					}
				},
			},
			home: {
				name: translate('act_home'),
				options: [],
				callback: () => instance.guard('bottom') && instance.bg(instance.home()),
			},
			check_start: {
				name: translate('act_check_start'),
				options: [],
				callback: () => instance.guard('check') && instance.bg(instance.startCheck()),
			},
			check_confirm: {
				name: translate('act_check_confirm'),
				options: [],
				callback: () => instance.guard('check') && instance.answerCheck(true),
			},
			check_reject: {
				name: translate('act_check_reject'),
				options: [],
				callback: () => instance.guard('check') && instance.answerCheck(false),
			},
			confirm_bottom: { name: translate('act_confirm_bottom'), options: [], callback: () => instance.confirmBottom() },
			restart_flow: { name: translate('act_restart_flow'), options: [], callback: () => instance.restartFlow() },
			check_databox: {
				name: translate('act_ping'),
				options: [],
				callback: () => instance.bg(instance.pingDataBox(false)),
			},
			calib_start: {
				name: translate('act_calib_start'),
				options: [],
				callback: () => instance.guard('pos') && instance.bg(instance.startCalibration()),
			},
			calib_top: {
				name: translate('act_calib_top'),
				options: [],
				callback: () => instance.bg(instance.finishCalibration()),
			},
			save_middle: {
				name: translate('act_save_middle'),
				options: [],
				callback: () => instance.guard('pos') && instance.saveMiddle(),
			},
			custom_hex: {
				name: translate('act_hex'),
				options: [{ type: 'textinput', id: 'hex', label: translate('opt_hex'), default: '81 09 00 02 FF' }],
				callback: (action) =>
					hexToBuffer(action.options.hex)
						? instance.send(action.options.hex)
						: instance.log('error', `Hex? ${action.options.hex}`),
			},
		}
	},
}
