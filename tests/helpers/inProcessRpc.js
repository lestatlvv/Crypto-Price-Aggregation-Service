'use strict';

function createInProcessRpc() {
  const responders = new Map();
  const publicKey = Buffer.alloc(32, 7);

  return {
    createServer() {
      return {
        publicKey,
        respond(method, handler) {
          responders.set(method, handler);
        },
        async listen() {
          return this;
        },
        async close() {
          responders.clear();
        }
      };
    },
    connect() {
      return {
        async request(method, payload) {
          const handler = responders.get(method);
          if (!handler) {
            throw new Error(`Unknown RPC method: ${method}`);
          }

          return handler(payload);
        },
        async end() {}
      };
    },
    async destroy() {
      responders.clear();
    }
  };
}

module.exports = {
  createInProcessRpc
};
