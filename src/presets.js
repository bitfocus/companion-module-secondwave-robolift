/*
 * Second Wave Robo Lift – MoPed Controller
 * Ready-made buttons, grouped in the order the operator needs them:
 * 1 data check, 2 movement check, 3 drive, 4 positions, 5 calibration, system up/down reminder, info.
 * Copyright (c) 2026 Schnittpunkt UG – MIT License
 */
const { combineRgb } = require('@companion-module/base')
const COLOR_PURPLE = combineRgb(128, 0, 192)
const COLOR_RED = combineRgb(198, 40, 40)
const COLOR_TEAL = combineRgb(0, 122, 102)
const COLOR_WHITE = combineRgb(255, 255, 255)
const COLOR_BLACK = combineRgb(0, 0, 0)
const COLOR_GREY = combineRgb(90, 90, 90)
const COLOR_GREEN = combineRgb(46, 125, 50)
const COLOR_AMBER = combineRgb(230, 164, 0)
const COLOR_DARK = combineRgb(40, 40, 40)
const COLOR_MID_GREY = combineRgb(110, 110, 110)
function button(
	category,
	name,
	text,
	bgcolor,
	downActions,
	upActions = [],
	feedbacks = [],
	size = '18',
	color = COLOR_WHITE,
) {
	return {
		type: 'button',
		category,
		name,
		style: { text, size, color, bgcolor },
		steps: [{ down: downActions, up: upActions }],
		feedbacks,
	}
}
module.exports = {
	getPresets: function (instance) {
		const translate = instance.t
		const label = instance.label
		const variable = (varId) => `$(${label}:${varId})`
		const CAT_ROW1 = `1 – ${translate('grp_row1')}`
		const CAT_ROW2 = `2 – ${translate('grp_row2')}`
		const CAT_DRIVE = `3 – ${translate('cat_drive')}`
		const CAT_POSITIONS = `4 – ${translate('cat_positions')}`
		const CAT_INFO = translate('cat_info')
		const COLOR_SLATE = combineRgb(60, 75, 100)
		const dimFeedback = (group) => ({
			feedbackId: 'dim',
			options: { group },
			style: { bgcolor: COLOR_DARK, color: COLOR_MID_GREY },
		})
		const blinkFeedback = (what) => ({
			feedbackId: 'blink',
			options: { what },
			style: { bgcolor: COLOR_WHITE, color: COLOR_BLACK },
		})
		const presets = {}
		for (const component of ['databox', 'controlbox', 'pedestal'])
			presets[`row1_${component}`] = button(
				CAT_ROW1,
				translate(`comp_${component}`),
				`${variable(`lbl_${component}`)}\n${variable(`sym_${component}`)}`,
				COLOR_SLATE,
				[],
				[],
				[
					{
						feedbackId: 'component_state',
						options: { component, state: 'ok' },
						style: { bgcolor: COLOR_GREEN, color: COLOR_WHITE },
					},
					{
						feedbackId: 'component_state',
						options: { component, state: 'fail' },
						style: { bgcolor: COLOR_RED, color: COLOR_WHITE },
					},
					blinkFeedback('row1'),
					dimFeedback('row1'),
				],
				'auto',
			)
		presets.row2_check = button(
			CAT_ROW2,
			translate('act_check_start'),
			variable('lbl_check'),
			COLOR_GREY,
			[{ actionId: 'check_start', options: {} }],
			[],
			[blinkFeedback('check'), dimFeedback('row2')],
			'auto',
		)
		presets.row2_moved = button(
			CAT_ROW2,
			translate('act_check_confirm'),
			variable('lbl_fb_moved'),
			COLOR_GREEN,
			[{ actionId: 'check_confirm', options: {} }],
			[],
			[dimFeedback('row2')],
			'auto',
		)
		presets.row2_nomove = button(
			CAT_ROW2,
			translate('act_check_reject'),
			variable('lbl_fb_nomove'),
			COLOR_RED,
			[{ actionId: 'check_reject', options: {} }],
			[],
			[dimFeedback('row2')],
			'auto',
		)
		presets.up = button(
			CAT_DRIVE,
			translate('dir_up'),
			'▲',
			COLOR_PURPLE,
			[{ actionId: 'up', options: {} }],
			[{ actionId: 'stop', options: {} }],
			[
				{ feedbackId: 'moving', options: { dir: 'up' }, style: { bgcolor: COLOR_AMBER, color: COLOR_BLACK } },
				dimFeedback('drive'),
			],
			'44',
		)
		presets.stop = button(
			CAT_DRIVE,
			translate('pre_stop'),
			variable('lbl_stop'),
			COLOR_RED,
			[{ actionId: 'stop', options: {} }],
			[],
			[],
			'24',
		)
		presets.down = button(
			CAT_DRIVE,
			translate('dir_down'),
			'▼',
			COLOR_PURPLE,
			[{ actionId: 'down', options: {} }],
			[{ actionId: 'stop', options: {} }],
			[
				{ feedbackId: 'moving', options: { dir: 'down' }, style: { bgcolor: COLOR_AMBER, color: COLOR_BLACK } },
				blinkFeedback('down'),
				dimFeedback('down'),
			],
			'44',
		)
		for (const target of ['top', 'middle', 'bottom'])
			presets[`pos_${target}`] = button(
				CAT_POSITIONS,
				translate(`pos_${target}`),
				`${variable('lbl_pos')}\n${variable(`lbl_${target}`)}\n${variable(`cd_${target}`)}`,
				COLOR_TEAL,
				[{ actionId: 'position', options: { target } }],
				[],
				[
					{ feedbackId: 'at_position', options: { target }, style: { bgcolor: COLOR_GREEN, color: COLOR_WHITE } },
					{ feedbackId: 'running', options: { target }, style: { bgcolor: COLOR_AMBER, color: COLOR_BLACK } },
					...(target === 'bottom' ? [blinkFeedback('bottom')] : []),
					dimFeedback(target === 'bottom' ? 'bottom' : 'pos'),
				],
				'auto',
			)
		presets.pos_custom = button(
			CAT_POSITIONS,
			translate('pos_custom'),
			`${variable('lbl_pos')}\n${variable('lbl_custom')} 16 s\n${variable('cd_custom')}`,
			COLOR_TEAL,
			[{ actionId: 'custom_position', options: { seconds: 16 } }],
			[],
			[
				{
					feedbackId: 'at_position',
					options: { target: 'custom' },
					style: { bgcolor: COLOR_GREEN, color: COLOR_WHITE },
				},
				{ feedbackId: 'running', options: { target: 'custom' }, style: { bgcolor: COLOR_AMBER, color: COLOR_BLACK } },
				dimFeedback('pos'),
			],
			'auto',
		)
		presets.confirm_bottom = button(
			CAT_POSITIONS,
			translate('act_confirm_bottom'),
			variable('lbl_confirm_bottom'),
			COLOR_GREY,
			[{ actionId: 'confirm_bottom', options: {} }],
			[],
			[blinkFeedback('confirm'), dimFeedback('confirm')],
			'auto',
		)
		presets.position_status = button(
			CAT_POSITIONS,
			translate('var_position'),
			variable('position'),
			COLOR_GREY,
			[],
			[],
			[],
			'14',
		)
		presets.home = button(
			CAT_POSITIONS,
			translate('act_home'),
			`${variable('lbl_home')}\n${variable('cd_home')}`,
			COLOR_GREY,
			[{ actionId: 'home', options: {} }],
			[],
			[
				{ feedbackId: 'running', options: { target: 'bottom' }, style: { bgcolor: COLOR_AMBER, color: COLOR_BLACK } },
				dimFeedback('pos'),
			],
			'auto',
		)
		presets.next_step = button(
			CAT_ROW2,
			translate('step_title'),
			variable('next_step'),
			COLOR_WHITE,
			[],
			[],
			[],
			'auto',
			COLOR_BLACK,
		)
		const CAT_CALIB = `5 – ${translate('cat_calib')}`
		presets.calib_start = button(
			CAT_CALIB,
			translate('act_calib_start'),
			translate('pre_calib_start'),
			COLOR_SLATE,
			[{ actionId: 'calib_start', options: {} }],
			[],
			[
				{ feedbackId: 'calibrating', options: {}, style: { bgcolor: COLOR_AMBER, color: COLOR_BLACK } },
				dimFeedback('pos'),
			],
			'14',
		)
		presets.calib_top = button(
			CAT_CALIB,
			translate('act_calib_top'),
			translate('pre_calib_top'),
			COLOR_GREEN,
			[{ actionId: 'calib_top', options: {} }],
			[],
			[{ feedbackId: 'calibrating', options: {}, style: { bgcolor: COLOR_AMBER, color: COLOR_BLACK } }],
			'14',
		)
		presets.calib_stop = button(
			CAT_CALIB,
			translate('pre_stop'),
			variable('lbl_stop'),
			COLOR_RED,
			[{ actionId: 'stop', options: {} }],
			[],
			[],
			'24',
		)
		presets.save_middle = button(
			CAT_CALIB,
			translate('act_save_middle'),
			translate('pre_save_middle'),
			COLOR_TEAL,
			[{ actionId: 'save_middle', options: {} }],
			[],
			[dimFeedback('pos')],
			'14',
		)
		presets.calib_status = button(
			CAT_CALIB,
			translate('var_calib_status'),
			variable('calib_status'),
			COLOR_GREY,
			[],
			[],
			[],
			'14',
		)
		const CAT_SYSTEM = translate('cat_system')
		const COLOR_SYS_UP = combineRgb(255, 240, 200)
		const COLOR_SYS_DOWN = combineRgb(220, 230, 255)
		presets.sys_up = button(
			CAT_SYSTEM,
			translate('pn_sys_up'),
			variable('lbl_sys_up'),
			COLOR_SYS_UP,
			[],
			[],
			[],
			'10',
			COLOR_BLACK,
		)
		presets.sys_up_1 = button(
			CAT_SYSTEM,
			`1 ${translate('dev_databox')}`,
			`1\n${translate('dev_databox')}`,
			COLOR_SYS_UP,
			[],
			[],
			[],
			'11',
			COLOR_BLACK,
		)
		presets.sys_up_2 = button(
			CAT_SYSTEM,
			`2 ${translate('dev_pedestal')}`,
			`2\n${translate('dev_pedestal')}`,
			COLOR_SYS_UP,
			[],
			[],
			[],
			'11',
			COLOR_BLACK,
		)
		presets.sys_reach = button(
			CAT_SYSTEM,
			translate('reach_ok').replace('\n', ' '),
			variable('databox_reach'),
			COLOR_SLATE,
			[],
			[],
			[
				{
					feedbackId: 'component_state',
					options: { component: 'databox', state: 'ok' },
					style: { bgcolor: COLOR_GREEN, color: COLOR_WHITE },
				},
				{
					feedbackId: 'component_state',
					options: { component: 'databox', state: 'fail' },
					style: { bgcolor: COLOR_RED, color: COLOR_WHITE },
				},
				{
					feedbackId: 'component_state',
					options: { component: 'databox', state: 'noreply' },
					style: { bgcolor: COLOR_AMBER, color: COLOR_BLACK },
				},
			],
			'11',
		)
		presets.sys_down = button(
			CAT_SYSTEM,
			translate('pn_sys_down'),
			variable('lbl_sys_down'),
			COLOR_SYS_DOWN,
			[],
			[],
			[],
			'10',
			COLOR_BLACK,
		)
		presets.sys_down_1 = button(
			CAT_SYSTEM,
			`1 ${translate('dev_pedestal')}`,
			`1\n${translate('dev_pedestal')}`,
			COLOR_SYS_DOWN,
			[],
			[],
			[],
			'11',
			COLOR_BLACK,
		)
		presets.sys_down_2 = button(
			CAT_SYSTEM,
			`2 ${translate('dev_databox')}`,
			`2\n${translate('dev_databox')}`,
			COLOR_SYS_DOWN,
			[],
			[],
			[],
			'11',
			COLOR_BLACK,
		)
		presets.info = button(
			CAT_INFO,
			'Robo Lift',
			`Robo Lift\n${variable('module_version')}`,
			COLOR_GREY,
			[],
			[],
			[],
			'14',
		)
		presets.restart = button(
			CAT_INFO,
			translate('act_restart_flow'),
			translate('act_restart_flow').split('(')[0].trim(),
			COLOR_GREY,
			[{ actionId: 'restart_flow', options: {} }],
			[],
			[],
			'auto',
		)
		presets.credit = button(
			CAT_INFO,
			translate('var_credit'),
			'Recht schnell!\n+ Schnittpunkt',
			COLOR_WHITE,
			[],
			[],
			[],
			'7',
			COLOR_GREY,
		)
		return presets
	},
}
