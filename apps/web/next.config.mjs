/** @type {import('next').NextConfig} */
const config = { transpilePackages: ['@zamp/domain', '@zamp/validation', '@zamp/database'], serverExternalPackages: ['@napi-rs/canvas', 'pdf-parse', 'exceljs', 'mammoth'], ...(process.env.ZAMP_NEXT_DIST_DIR ? {distDir: process.env.ZAMP_NEXT_DIST_DIR} : {}) };
export default config;
