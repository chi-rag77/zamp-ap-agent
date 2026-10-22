export const metadata = { title: 'Zamp AP Agent', description: 'Accounts payable domain foundation' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
