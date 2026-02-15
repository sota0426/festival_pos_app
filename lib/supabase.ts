import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js"
import { getSyncEnabled } from "./syncMode";


const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY

export const hasSupabaseEnvConfigured = (): boolean => {
  return !!SUPABASE_URL && !!SUPABASE_ANON_KEY;
}

export const isSupabaseConfigured = ():boolean =>{
  return hasSupabaseEnvConfigured() && getSyncEnabled();
}

export const supabase = createClient(
    SUPABASE_URL ?? "https://placeholder.supabase.co" , 
    SUPABASE_ANON_KEY ?? "placeholder-anon-key",
    {
      auth:{
        storage:AsyncStorage,
        autoRefreshToken:true,
        persistSession:true,
        detectSessionInUrl:false
      }
    });
