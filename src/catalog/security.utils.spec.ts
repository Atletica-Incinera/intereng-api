import { storeDocument, decryptDocument, maskDocument } from './security.utils';

describe('security.utils', () => {
  const cpfFormatted = '123.456.789-00';
  const cpfUnformatted = '12345678900';

  it('should encrypt and decrypt correctly', () => {
    const stored = storeDocument(cpfFormatted);
    expect(stored).toContain(':');

    const decrypted = decryptDocument(stored);
    expect(decrypted).toBe(cpfFormatted);
  });

  it('should be deterministic', () => {
    const stored1 = storeDocument(cpfFormatted);
    const stored2 = storeDocument(cpfFormatted);
    expect(stored1).toBe(stored2);
  });

  it('should mask CPF formatted and unformatted correctly', () => {
    expect(maskDocument(cpfFormatted)).toBe('***.456.***-**');
    expect(maskDocument(cpfUnformatted)).toBe('***456*****');
  });

  it('should fallback gracefully for other documents', () => {
    expect(maskDocument('12345')).toBe('***');
    expect(maskDocument('1234567')).toBe('**345**');
  });
});
