import {LoginExperience} from './login-experience';

export const metadata={title:'Sign in — Zamp AP Invoice',description:'Sign in to your Zamp AP Invoice workspace.'};

function safeReturnTo(value?:string){return value?.startsWith('/')&&!value.startsWith('//')&&!value.includes('\\')?value:'/'}

export default async function LoginPage({searchParams}:{searchParams:Promise<{returnTo?:string;error?:string}>}){
  const params=await searchParams;
  return <LoginExperience returnTo={safeReturnTo(params.returnTo)} initialError={params.error==='configuration'?'Sign-in is temporarily unavailable. Please contact your workspace administrator.':undefined}/>;
}
