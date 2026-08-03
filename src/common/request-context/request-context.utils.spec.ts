import { IncomingMessage, ServerResponse } from 'http';
import { getOrCreateRequestId } from './request-context.utils';

describe('getOrCreateRequestId', () => {
  let mockReq: Partial<IncomingMessage & { id?: unknown }>;
  let mockRes: Partial<ServerResponse>;

  beforeEach(() => {
    mockReq = {
      headers: {},
    };
    mockRes = {
      headersSent: false,
      setHeader: jest.fn(),
    };
  });

  it('should use req.id if it is already present as a string', () => {
    mockReq.id = 'existing-req-id';
    const result = getOrCreateRequestId(
      mockReq as IncomingMessage,
      mockRes as ServerResponse,
    );

    expect(result).toBe('existing-req-id');
    expect(mockReq.headers?.['x-request-id']).toBe('existing-req-id');
    expect(mockRes.setHeader).toHaveBeenCalledWith(
      'x-request-id',
      'existing-req-id',
    );
  });

  it('should fallback to x-request-id header if req.id is not present', () => {
    mockReq.headers = { 'x-request-id': 'header-req-id' };
    const result = getOrCreateRequestId(
      mockReq as IncomingMessage,
      mockRes as ServerResponse,
    );

    expect(result).toBe('header-req-id');
    expect(mockReq.headers['x-request-id']).toBe('header-req-id');
    expect(mockRes.setHeader).toHaveBeenCalledWith(
      'x-request-id',
      'header-req-id',
    );
  });

  it('should fallback to x-correlation-id header if req.id and x-request-id are not present', () => {
    mockReq.headers = { 'x-correlation-id': 'correlation-req-id' };
    const result = getOrCreateRequestId(
      mockReq as IncomingMessage,
      mockRes as ServerResponse,
    );

    expect(result).toBe('correlation-req-id');
    expect(mockReq.headers['x-request-id']).toBe('correlation-req-id');
    expect(mockRes.setHeader).toHaveBeenCalledWith(
      'x-request-id',
      'correlation-req-id',
    );
  });

  it('should generate a new random UUID if no request ID is present in headers or req.id', () => {
    const result = getOrCreateRequestId(
      mockReq as IncomingMessage,
      mockRes as ServerResponse,
    );

    expect(result).toBeDefined();
    expect(typeof result).toBe('string');
    expect(result.length).toBe(36); // Length of a UUID v4
    expect(mockReq.headers?.['x-request-id']).toBe(result);
    expect(mockRes.setHeader).toHaveBeenCalledWith('x-request-id', result);
  });

  it('should not call setHeader on response if headers are already sent', () => {
    mockReq.id = 'some-id';
    mockRes.headersSent = true;

    const result = getOrCreateRequestId(
      mockReq as IncomingMessage,
      mockRes as ServerResponse,
    );

    expect(result).toBe('some-id');
    expect(mockReq.headers?.['x-request-id']).toBe('some-id');
    expect(mockRes.setHeader).not.toHaveBeenCalled();
  });
});
