    it('should handle RPC error responses', async () => {
      const mockResponse = {
        jsonrpc: '2.0',
        error: {
          code: -32600,
          message: 'Invalid Request',
           { reason: 'Method not found' },
        },
        id: 1,
      };

      mockApiClient.post.mockResolvedValue(mockResponse);

      await expect(rpc.call('invalid.method')).rejects.toThrow('Invalid Request');
    });