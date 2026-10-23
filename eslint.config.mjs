import tseslint from 'typescript-eslint';
export default tseslint.config(
  { ignores: ['node_modules/**', '**/.next/**', '**/.next-policy-dev/**', '**/next-env.d.ts', 'supabase/**', '.npm-cache/**'] },
  ...tseslint.configs.recommended
);
