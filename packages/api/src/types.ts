export interface AuthContext {
  keyId: string;
  permissions: string[];
}

export type AppEnv = {
  Variables: {
    auth: AuthContext;
  };
};
