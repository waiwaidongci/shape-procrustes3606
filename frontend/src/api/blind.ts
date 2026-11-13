import {request,post} from './client';
import type {BlindVerification} from '../types/domain';
export const list=(run_id?:number)=>request<BlindVerification[]>('/blind-verifications'+(run_id?'?run_id='+run_id:''));
export const create=(data:unknown)=>post<BlindVerification>('/blind-verifications',data);
export const detail=(id:number)=>request<BlindVerification>('/blind-verifications/'+id);
