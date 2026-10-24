'use client';

import {useActionState} from 'react';
import {createOrganizationAction,type OrganizationSetupState} from './actions';

const initialState:OrganizationSetupState={};

export function OrganizationSetupForm({returnTo}:{returnTo:string}){
  const [state,action,pending]=useActionState(createOrganizationAction,initialState);
  return <form className="organization-setup-form" action={action}>
    <label htmlFor="organization-name">Organization name</label>
    <input id="organization-name" name="name" autoComplete="organization" placeholder="Acme Corporation" minLength={2} maxLength={80} required/>
    <input type="hidden" name="returnTo" value={returnTo}/>
    <p className="organization-setup-note">You’ll be the organization admin. Your invoices, vendors, policies, and integrations will be stored in this organization’s workspace.</p>
    {state.error&&<p className="organization-setup-error" role="alert">{state.error}</p>}
    <button className="organization-setup-submit" type="submit" disabled={pending}>{pending?'Creating workspace…':'Create organization'}</button>
  </form>
}
