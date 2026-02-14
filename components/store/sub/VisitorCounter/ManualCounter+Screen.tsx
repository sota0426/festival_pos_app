import { useVisitorCounter } from "hooks/useVisitorCounter";
import { useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { Branch, VisitorGroup } from "types/database";
import { VisitorHeader } from "./VisitorScreen+Header";
import { SafeAreaView } from "react-native-safe-area-context";
import { ManualCounter } from "./ManualCounter";
import { VisitorFooter } from "./VisitorScreen+Footer";

interface Props{
  branch:Branch;
  onBack:()=>void;
}

export interface GroupOption{
  id:VisitorGroup;
  name:string;
  color:string;
}


const COLORS = [
  "bg-purple-600",
  "bg-blue-600",
  "bg-green-600",
  "bg-orange-500",
  "bg-pink-500",
  "bg-indigo-600",
  "bg-teal-500",
  "bg-red-500",
];


export const ManualCounterScreen=({
  branch,
  onBack
}:Props)=>{
  const {groupCounts,handleCount} = useVisitorCounter(branch.id)

  const MAX_GROUPS=4;

  const [groups,setGroups] = useState<GroupOption[]>([
    {
      id:"group1",
      name:"グループ１",
      color:COLORS[0]
    }
  ])

  /** add groups */
  const addGroup = () => {
    if (groups.length >= MAX_GROUPS) return;

    const usedColors = groups.map(g => g.color);

    const availableColor =
      COLORS.find(c => !usedColors.includes(c)) ||
      COLORS[groups.length % COLORS.length];

    const numbers = groups.map(g =>
      parseInt(g.id.replace("group", ""))
    );

    const nextNumber = Math.max(...numbers) + 1;

    setGroups(prev => [
      ...prev,
      {
        id: `group${nextNumber}` as VisitorGroup,
        name: `グループ${nextNumber}`,
        color: availableColor,
      },
    ]);
  };


  //** rename */
  const handleRename =(groupId:VisitorGroup,name:string)=>{
    setGroups((prev)=>
      prev.map((g)=>
        g.id === groupId ? {...g, name} : g
      )
    )
  }

  //**delete */
  const handleDelete =(groupId:VisitorGroup) =>{
    setGroups((prev)=>{
      if(prev.length <= 1) return prev;

      const filtered = prev.filter((g)=> g.id !== groupId);

      return filtered.map((g,index)=>({
        ...g,
        id:`group${index + 1}` as VisitorGroup,
      }))
    })
  }

  return(
    <SafeAreaView className="flex-1 bg-purple-50" edges={["top"]} >
      <VisitorHeader 
        branch={branch}
        onBack={onBack}
      />
      
      {/** add group button*/}
      <View className="flex-row justify-end p-4">
        {groups.length < MAX_GROUPS && (
          <TouchableOpacity 
            onPress={addGroup}
            className="bg-green-600 px-4 py-2 rounded-xl"
          >
            <Text className="text-white font-bold">
              ＋ 追加
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/** counter button */}
      <View>
        <ManualCounter 
          groups={groups}
          counts={groupCounts}
          onCount={handleCount}
          onDelete={handleDelete}
          onRename={handleRename}
        />
      </View>

      <VisitorFooter 
        branch={branch}
      />




    </SafeAreaView>
  )


}