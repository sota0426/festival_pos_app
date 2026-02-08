import { Branch } from "types/database";

interface Props{
  branch:Branch;
  onNavigateToRegister:()=>void;
  onNavigateToMenus:()=>void;
  onNavigateToHistory:()=>void;
}

export const MainTabScreen=({
  branch,
  onNavigateToHistory,
  onNavigateToMenus,
  onNavigateToRegister
}:Props)=>{
  
}