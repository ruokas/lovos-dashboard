function createQueryBuilder() {
  return {
    select: async () => ({ data: [], error: null }),
    insert: (payload) => ({
      select: async () => ({ data: Array.isArray(payload) ? payload : [payload ?? null], error: null }),
    }),
    update: () => ({
      eq: async () => ({ data: [], error: null }),
    }),
    delete: () => ({
      eq: async () => ({ data: [], error: null }),
      neq: async () => ({ data: [], error: null }),
    }),
    eq() {
      return this;
    },
    neq() {
      return this;
    },
    order() {
      return this;
    },
    limit() {
      return this;
    },
    range() {
      return this;
    },
    single: async () => ({ data: null, error: null }),
  };
}

export function createClient() {
  return {
    from: () => createQueryBuilder(),
    rpc: async () => ({ data: null, error: null }),
    auth: {
      async getUser() {
        return { data: { user: null }, error: { name: 'AuthSessionMissingError', message: 'Auth session missing' } };
      },
      async signInWithOtp() {
        return { data: null, error: null };
      },
    },
  };
}
