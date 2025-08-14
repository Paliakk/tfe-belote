import axios from 'axios';


const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export const api = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

console.log('[API] baseURL =', api.defaults.baseURL);

