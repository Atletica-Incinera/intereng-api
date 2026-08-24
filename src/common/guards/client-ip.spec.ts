import { resolveClientIp } from './client-ip';

describe('resolveClientIp', () => {
  it('cai no IP do socket quando não há proxy na frente', () => {
    expect(resolveClientIp({ headers: {}, ip: '198.51.100.7' })).toBe('198.51.100.7');
    expect(resolveClientIp({ headers: {}, socket: { remoteAddress: '198.51.100.8' } })).toBe(
      '198.51.100.8',
    );
  });

  it('normaliza IPv4 encapsulado em IPv6 para não criar dois baldes', () => {
    expect(resolveClientIp({ headers: {}, ip: '::ffff:198.51.100.7' })).toBe('198.51.100.7');
  });

  it('lê a última entrada do X-Forwarded-For, que é a que o nginx acrescentou', () => {
    expect(
      resolveClientIp({ headers: { 'x-forwarded-for': '9.9.9.9, 198.51.100.7' }, ip: '127.0.0.1' }),
    ).toBe('198.51.100.7');
  });

  it('aceita o header repetido, que o Node entrega como lista', () => {
    expect(resolveClientIp({ headers: { 'x-forwarded-for': ['9.9.9.9', '198.51.100.7'] } })).toBe(
      '198.51.100.7',
    );
  });

  it('não devolve vazio quando o header chega sujo', () => {
    expect(resolveClientIp({ headers: { 'x-forwarded-for': ' , ' }, ip: '198.51.100.7' })).toBe(
      '198.51.100.7',
    );
    expect(resolveClientIp({ headers: {} })).toBe('desconhecido');
  });
});
