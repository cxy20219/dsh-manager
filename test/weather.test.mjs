import assert from 'node:assert/strict'
import test from 'node:test'

import { createWeatherTool } from '../src/agent-search.js'
import { fetchWeather, formatWeather, sanitizeWeatherResult, wmoText } from '../src/weather.js'

test('weather maps Open-Meteo geocoding and forecast data', async () => {
	const original = globalThis.fetch
	globalThis.fetch = async (url) => {
		const target = String(url)
		if (target.includes('geocoding-api')) {
			return new Response(JSON.stringify({ results: [{ name: 'Shanghai', admin1: 'Shanghai', country: 'China', latitude: 31.2, longitude: 121.5 }] }), { status: 200 })
		}
		return new Response(JSON.stringify({
			timezone: 'Asia/Shanghai',
			current: { temperature_2m: 22, apparent_temperature: 23, relative_humidity_2m: 60, wind_speed_10m: 8, weather_code: 1 },
			daily: {
				time: ['2026-11-13', '2026-11-14'],
				temperature_2m_min: [15, 14],
				temperature_2m_max: [24, 23],
				weather_code: [1, 3],
				precipitation_probability_max: [10, 20],
			},
		}), { status: 200 })
	}
	try {
		const value = sanitizeWeatherResult(await fetchWeather('Shanghai', 2, 'zh'))
		assert.equal(value.location, 'Shanghai, Shanghai, China')
		assert.equal(value.current.temperature, 22)
		assert.equal(value.daily.length, 2)
		assert.match(value.current.text, /WMO 1/)
		assert.match(formatWeather(value, 'zh'), /上海|Shanghai/)
	} finally {
		globalThis.fetch = original
	}
})

test('weather tool renders a forecast and accepts injected data', async () => {
	const tool = createWeatherTool({
		weather: async (location, days, lang) => ({
			location,
			latitude: 1,
			longitude: 2,
			timezone: 'UTC',
			current: { temperature: 20, apparent: 19, humidity: 50, wind: 5, code: 0, text: wmoText(0, lang) },
			daily: [{ date: '2026-11-13', min: 10, max: 21, code: 0, text: wmoText(0, lang), precipitationProbability: 0 }],
		}),
	})
	const value = await tool.execute({ location: 'Test', days: 1 })
	assert.equal(value.location, 'Test')
	assert.equal(value.daily.length, 1)
	const rendered = tool.output.render({}, value)
	assert.match(rendered[0].text, /Test/)
	assert.match(rendered[0].text, /20°C/)
})

test('wmoText falls back to English and marks unknown codes', () => {
	assert.match(wmoText(0, 'zh'), /晴/)
	assert.match(wmoText(0, 'fr'), /Clear sky/)
	assert.match(wmoText(999, 'zh'), /未知/)
})
