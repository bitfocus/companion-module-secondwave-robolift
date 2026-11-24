/*
 * Second Wave Robo Lift – MoPed Controller
 * Upgrade scripts (run by Companion in order, once per connection).
 * Copyright (c) 2026 Schnittpunkt UG – MIT License
 */
const DEFAULTS = {
	language: 'de',
	host: '192.168.1.8',
	port: 52381,
	localport: 52381,
	address: 1,
	transport: 'ip',
	fulltravel: 19,
	travel: 16,
	reserve: 3,
	middle: 8,
	maxdrive: 40,
	testpulse: 1,
	pollinterval: 30,
}
const NONZERO_KEYS = ['port', 'address', 'fulltravel', 'travel', 'middle', 'maxdrive', 'testpulse']
module.exports = [
	// fill settings that are missing or zero with their defaults
	function (context, props) {
		const config = props.config
		if (!config) return { updatedConfig: null, updatedActions: [], updatedFeedbacks: [] }
		let changed = false
		for (const [key, defaultValue] of Object.entries(DEFAULTS)) {
			const value = config[key]
			if (value == null || value === '' || (NONZERO_KEYS.includes(key) && Number(value) === 0)) {
				config[key] = defaultValue
				changed = true
			}
		}
		return { updatedConfig: changed ? config : null, updatedActions: [], updatedFeedbacks: [] }
	},
	// model selection added: connections created before keep their own travel times ("Custom")
	function (context, props) {
		const config = props.config
		if (!config || config.model) return { updatedConfig: null, updatedActions: [], updatedFeedbacks: [] }
		config.model = 'custom'
		return { updatedConfig: config, updatedActions: [], updatedFeedbacks: [] }
	},
]
