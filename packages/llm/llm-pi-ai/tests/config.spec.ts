import { describe, expect, it } from 'vitest'
import { assertServiceable, Config } from '../src/config.ts'

/** Validate one hand-declared route, with the caller's fields layered onto it. */
const routeWith = (profile: Record<string, unknown>): (() => unknown) =>
  () => Config({
    providers: {
      'acme-gateway': {
        api: 'openai-completions',
        baseURL: 'https://acme.test',
        models: [{ id: 'm' }],
        ...profile,
      },
    },
  })

/** Validate that route with the caller's fields on its single model entry. */
const configWith = (model: Record<string, unknown>): (() => unknown) =>
  routeWith({ models: [{ id: 'm', ...model }] })

describe('proxy schema boundary', () => {
  it('accepts an http(s) proxy URL on a hand-declared route', () => {
    expect(() => { assertServiceable(routeWith({ proxy: 'http://10.221.113.188:10810' })() as Config) }).not.toThrow()
    expect(() => { assertServiceable(routeWith({ proxy: 'https://proxy.example:8443' })() as Config) }).not.toThrow()
  })

  it('rejects a proxy that is not a valid URL', () => {
    expect(() => { assertServiceable(routeWith({ proxy: 'not a url' })() as Config) })
      .toThrow(/proxy "not a url" is not a valid URL/)
  })

  it('rejects a proxy whose protocol is not http(s)', () => {
    expect(() => { assertServiceable(routeWith({ proxy: 'socks5://127.0.0.1:1080' })() as Config) })
      .toThrow(/must use http:\/\/ or https:\/\//)
  })

  it('accepts an empty proxy string through the schema and refuses it at serviceability', () => {
    // The schema accepts any string (empty included), matching baseURL; the
    // namespace validator is what refuses a route the adapter cannot serve.
    expect(routeWith({ proxy: '' })).not.toThrow()
    expect(() => { assertServiceable(routeWith({ proxy: '' })() as Config) })
      .toThrow(/proxy "" is not a valid URL/)
  })
})

describe('reasoning schema boundary', () => {
  it('rejects a level pi-ai does not know at the write that produced it', () => {
    expect(configWith({ reasoningEfforts: { ultra: 'x' } })).toThrow(/"off"/)
    expect(configWith({ reasoningEfforts: { high: 42 } })).toThrow()
  })

  it('keeps false distinguishable from an absent declaration', () => {
    type Materialized = { providers: Record<string, { models?: { reasoningEfforts?: unknown }[] }> }
    const withFalse = configWith({ reasoningEfforts: false })() as Materialized
    expect(withFalse.providers['acme-gateway']?.models?.[0]?.reasoningEfforts).toBe(false)
    const absent = configWith({})() as Materialized
    expect(absent.providers['acme-gateway']?.models?.[0]?.reasoningEfforts).toBeUndefined()
  })

  it('rejects a thinking format outside the offered set', () => {
    expect(configWith({ compat: { thinkingFormat: 'quantum' } })).toThrow(/expected/)
  })
})

describe('modality schema boundary', () => {
  it('rejects a modality pi-ai does not know, at either level', () => {
    expect(configWith({ input: ['audio'] })).toThrow(/expected/)
    expect(routeWith({ defaultInput: ['text', 'audio'] })).toThrow(/expected/)
  })

  it('refuses a route whose models could accept nothing', () => {
    // The pair the settings seam runs: the schema accepts the empty list as
    // well-typed, and the namespace validator is what refuses it. Asserting
    // only the schema would report this route as writable.
    expect(routeWith({ defaultInput: [] })).not.toThrow()
    expect(() => { assertServiceable(routeWith({ defaultInput: [] })() as Config) })
      .toThrow(/defaultInput must name at least one modality/)
  })

  type Materialized = {
    providers: Record<string, { defaultInput?: unknown; models?: { input?: unknown }[] }>
  }

  it('materializes an absent entry list as empty and an absent route list as text', () => {
    // The empty-list inheritance rule exists because of exactly this: an entry
    // that declares nothing reaches resolution as `[]`, not as `undefined`.
    const absent = configWith({})() as Materialized
    expect(absent.providers['acme-gateway']?.models?.[0]?.input).toEqual([])
    expect(absent.providers['acme-gateway']?.defaultInput).toEqual(['text'])
  })
})
