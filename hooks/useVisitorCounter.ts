import { getPendingVisitorCounts, savePendingVisitorCount } from "lib/storage";
import { useCallback, useEffect, useMemo, useState } from "react";
import { HalfHourlyVisitors, PendingVisitorCount, VisitorGroup } from "types/database";
import * as Crypto from 'expo-crypto';
import { alertNotify, safeVibrate } from "lib/alertUtils";
import { isSupabaseConfigured, supabase } from "lib/supabase";

const GROUPS:VisitorGroup[]=[
  "group1",
  "group2",
  "group3",
  "group4"
]

export const useVisitorCounter = (branchId:string) =>{

  const [pendingCounts,setPendingCounts] = useState<PendingVisitorCount[]>([])
  const [lastCountTime , setLastCountTime] = useState<string | null>(null);

  //**initial loading */
  const loadTodayCounts = useCallback(async()=>{
    const all = await getPendingVisitorCounts();
    const today = new Date().toDateString();

    const todayCounts = all.filter(
      (c) =>
        c.branch_id === branchId &&
        new Date(c.timestamp).toDateString() == today
    );

    setPendingCounts(todayCounts);

    if(pendingCounts.length > 0){
      setLastCountTime(todayCounts[todayCounts.length - 1].timestamp);
    }
  },[branchId]);

  useEffect(()=>{
    loadTodayCounts();
  },[])

  /** counts per Group */
  const groupCounts = useMemo(()=>{
    const map:Record<VisitorGroup,number> = {
      group1:0,
      group2:0,
      group3:0,
      group4:0,
    };

    pendingCounts.forEach((c)=>{
      map[c.group] += c.count;
    });

    return map
  },[pendingCounts])

  /**sum */
  const todayTotal = useMemo(()=>{
    return Object.values(groupCounts).reduce((a,b) => a+b , 0)
  },[groupCounts]);

  const handleCount = async(
    group:VisitorGroup,
    count:number
  ) => {
    if( count === 0) return;

    const now = new Date().toISOString();
    const id = Crypto.randomUUID();

    safeVibrate(40);

    const visitor:PendingVisitorCount = {
      id,
      branch_id:branchId,
      group,
      count,
      timestamp:now,
      synced:false,
    };

    try{
      await savePendingVisitorCount(visitor);

      setPendingCounts((prev) => [...prev,visitor]);
      setLastCountTime(now);

      if(isSupabaseConfigured()){
        await supabase.from("visitor_counts").insert({
          id,
          branch_id:branchId,
          group,
          count,
          timestamp:now
        })
      }
    }catch{
      alertNotify("Error","カウント保存に失敗しました")
    }






  }

  const quarterHourlyData = useMemo(():HalfHourlyVisitors[] =>{
    const map = new Map<string,number>();
    
    pendingCounts.forEach((v)=>{
      const d = new Date(v.timestamp);
      const minites = d.getMinutes();
      const slotMinutes = Math.floor(minites / 15) * 15 ;

      const h = d.getHours().toString().padStart(2,"0");
      const m = slotMinutes.toString().padStart(2,"0")
      const key = `${h}:${m}`

      map.set(key,(map.get(key) || 0 ) + v.count);
    })

      return Array.from(map.entries())
        .map(([time_slot,count]) => ({time_slot,count}))
        .sort((a,b) => a.time_slot.localeCompare(b.time_slot))
  },[pendingCounts])

  const maxVisitorSlot = useMemo(()=>{
    if(quarterHourlyData.length === 0) return 1;
    return Math.max(...quarterHourlyData.map((s)=>s.count));
  },[quarterHourlyData]);

  const formatTime = (isoString:string | null) =>{
    if(!isoString) return "--:--";
    const date = new Date(isoString);
    return `${date.getHours().toString().padStart(2,"0")}:${date.getMinutes().toString().padStart(2,"0")}`;
  };

  return{
    groupCounts,
    todayTotal,
    lastCountTime,
    handleCount,
    formatTime,
    quarterHourlyData,
    maxVisitorSlot,
  }



}