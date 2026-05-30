import { describe, expect, it } from 'vitest';
import { normalizeRegisteredPjsipEndpoint } from '../src/realtime/outbound-dialer.js';

describe('normalizeRegisteredPjsipEndpoint', () => {
  it('uses the registered endpoint instead of a stale contact URI', () => {
    expect(
      normalizeRegisteredPjsipEndpoint(
        'PJSIP/1001/sip:1001@127.0.0.1:50766',
        '1001',
      ),
    ).toBe('PJSIP/1001');
  });

  it('does not rewrite unrelated explicit SIP URIs', () => {
    expect(
      normalizeRegisteredPjsipEndpoint(
        'PJSIP/provider/sip:+251911000000@sip.example.com',
        '+251911000000',
      ),
    ).toBe('PJSIP/provider/sip:+251911000000@sip.example.com');
  });
});
