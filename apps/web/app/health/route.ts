import {NextResponse} from 'next/server';

export const runtime='nodejs';
export const dynamic='force-dynamic';

/** Lightweight process liveness endpoint for the hosting platform. */
export function GET(){
  return NextResponse.json({status:'ok'},{headers:{'Cache-Control':'no-store'}});
}
