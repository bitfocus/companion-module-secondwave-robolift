/*
 * Second Wave Robo Lift – MoPed Controller
 * Feedback definitions: locked/greyed-out buttons, blinking hints, check results, movement and position state.
 * Copyright (c) 2026 Schnittpunkt UG – MIT License
 */
const { combineRgb } = require('@companion-module/base')
module.exports = {
	getFeedbacks: function (instance) {
		const translate = instance.t
		const groupChoices = [
			{ id: 'row1', label: translate('grp_row1') },
			{ id: 'row2', label: translate('grp_row2') },
			{ id: 'drive', label: translate('grp_drive') },
			{ id: 'down', label: translate('grp_down') },
			{ id: 'pos', label: translate('grp_pos') },
			{ id: 'bottom', label: translate('grp_bottom') },
			{ id: 'confirm', label: translate('grp_confirm') },
		]
		const now = () => Date.now()
		return {
			dim: {
				type: 'boolean',
				name: translate('fb_dim'),
				defaultStyle: { bgcolor: combineRgb(40, 40, 40), color: combineRgb(110, 110, 110) },
				options: [
					{ type: 'dropdown', id: 'group', label: translate('opt_group'), default: 'drive', choices: groupChoices },
				],
				callback: (feedback) => {
					const state = instance.state
					switch (feedback.options.group) {
						case 'row1':
							return state.flow !== 'check' && state.rowBlinkUntil < now()
						case 'row2':
							return state.flow !== 'check'
						case 'bottom':
							return !instance.allowed('bottom')
						case 'confirm':
							return state.flow !== 'confirm'
						default:
							return !instance.allowed(feedback.options.group)
					}
				},
			},
			blink: {
				type: 'boolean',
				name: translate('fb_blink'),
				defaultStyle: { bgcolor: combineRgb(255, 255, 255), color: combineRgb(0, 0, 0) },
				options: [
					{
						type: 'dropdown',
						id: 'what',
						label: translate('opt_group'),
						default: 'check',
						choices: [
							{ id: 'row1', label: translate('grp_row1') },
							{ id: 'check', label: translate('pre_check').replace('\n', ' ') },
							{ id: 'confirm', label: translate('grp_confirm') },
							{ id: 'bottom', label: translate('grp_bottom') },
							{ id: 'down', label: translate('grp_down') },
						],
					},
				],
				callback: (feedback) => {
					const state = instance.state
					const what = feedback.options.what
					// the check button follows its own rhythm, everything else blinks with the 400 ms tick
					if (what === 'check') return instance.checkBlinkOn()
					if (!state.tick) return false
					switch (what) {
						case 'row1':
							return state.rowBlinkUntil > now()
						case 'bottom':
						case 'down':
							return state.flow === 'confirm' && state.drive === 'idle' && !state.target
						case 'confirm':
							return state.flow === 'confirm'
						default:
							return false
					}
				},
			},
			component_state: {
				type: 'boolean',
				name: translate('fb_component'),
				defaultStyle: { bgcolor: combineRgb(0, 122, 102), color: combineRgb(255, 255, 255) },
				options: [
					{
						type: 'dropdown',
						id: 'component',
						label: translate('opt_component'),
						default: 'databox',
						choices: [
							{ id: 'databox', label: translate('comp_databox') },
							{ id: 'controlbox', label: translate('comp_controlbox') },
							{ id: 'pedestal', label: translate('comp_pedestal') },
						],
					},
					{
						type: 'dropdown',
						id: 'state',
						label: translate('opt_state'),
						default: 'ok',
						choices: ['ok', 'fail', 'noreply', 'wait', 'unconfirmed', 'checking', 'unknown'].map((stateId) => ({
							id: stateId,
							label: instance.stateText(stateId),
						})),
					},
				],
				callback: (feedback) => instance.state.check[feedback.options.component] === feedback.options.state,
			},
			moving: {
				type: 'boolean',
				name: translate('fb_moving'),
				defaultStyle: { bgcolor: combineRgb(230, 164, 0), color: combineRgb(0, 0, 0) },
				options: [
					{
						type: 'dropdown',
						id: 'dir',
						label: translate('opt_direction'),
						default: 'up',
						choices: [
							{ id: 'up', label: translate('dir_up') },
							{ id: 'down', label: translate('dir_down') },
						],
					},
				],
				callback: (feedback) => instance.state.drive === feedback.options.dir,
			},
			need_ref: {
				type: 'boolean',
				name: translate('fb_need_ref'),
				defaultStyle: { bgcolor: combineRgb(230, 164, 0), color: combineRgb(0, 0, 0) },
				options: [],
				callback: () => instance.state.posSec == null && !instance.state.target && instance.state.hintOn,
			},
			running: {
				type: 'boolean',
				name: translate('fb_running'),
				defaultStyle: { bgcolor: combineRgb(230, 164, 0), color: combineRgb(0, 0, 0) },
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
							{ id: 'custom', label: translate('pos_custom') },
						],
					},
				],
				callback: (feedback) => instance.state.target === feedback.options.target && instance.state.blinkOn,
			},
			calibrating: {
				type: 'boolean',
				name: translate('fb_calibrating'),
				defaultStyle: { bgcolor: combineRgb(230, 164, 0), color: combineRgb(0, 0, 0) },
				options: [],
				callback: () => !!instance.state.calib && !!instance.state.tick,
			},
			at_position: {
				type: 'boolean',
				name: translate('fb_position'),
				defaultStyle: { bgcolor: combineRgb(0, 170, 140), color: combineRgb(255, 255, 255) },
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
							{ id: 'custom', label: translate('pos_custom') },
						],
					},
				],
				callback: (feedback) =>
					instance.state.drive === 'idle' && !instance.state.target && instance.posLabel() === feedback.options.target,
			},
		}
	},
}
