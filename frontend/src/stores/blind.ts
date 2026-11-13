import {createStore} from '../utils/store';
import * as api from '../api/blind';
import type {BlindVerification} from '../types/domain';
export const blindStore=createStore<{items:BlindVerification[]}>({items:[]});
export async function loadBlinds(){blindStore.set({items:await api.list()})}
export async function submitBlind(data:unknown){const report=await api.create(data);await loadBlinds();return report}
export function selectBlind(id:number){localStorage.setItem('shapes-blind',String(id))}
