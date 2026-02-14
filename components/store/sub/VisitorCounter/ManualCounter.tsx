import { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  TextInput,
  Platform,
  Alert,
} from "react-native";
import type { VisitorGroup } from "types/database";
import { GroupOption } from "./ManualCounter+Screen";


interface Props {
  groups: GroupOption[];
  counts: Record<VisitorGroup, number>;
  onCount: (groupId: VisitorGroup, value: number) => void | Promise<void>;
  onRename:(groupId:VisitorGroup, name:string) =>void;
  onDelete:(groupId:VisitorGroup) =>void
}



export const ManualCounter = ({
  groups,
  counts,
  onCount,
  onRename,
  onDelete
}: Props) => {

  const [editGroup, setEditGroup] =
    useState<GroupOption | null>(null);

  const [tempValue, setTempValue] = useState(0);
  const [renameMode, setRenameMode] = useState(false);
  const [renameText, setRenameText] = useState("");
    
  const openEditor = (group: GroupOption) => {
    setTempValue(0);
    setEditGroup(group);
    setRenameMode(false);
    setRenameText(group.name);
  };

  const applyRename =() =>{
    if(!editGroup) return;
    if(!renameText.trim()) return;

    onRename(editGroup.id, renameText.trim())
    setRenameMode(false);    
  }

  const applyChange = () => {
    if (!editGroup) return;
    const currentCount = counts[editGroup.id] ?? 0;
    const safeDelta = Math.max(tempValue, -currentCount);

    if (safeDelta !== 0) onCount(editGroup.id, safeDelta);
    setEditGroup(null);
    setTempValue(0);
  };

  return (
    <View className="flex-1">

      {/* グループボタン */}
      <View className="flex-row flex-wrap justify-center gap-20">
        {groups.map((group,index) => (
          <View 
            key={group.id}
            className="items-center mb-6"
          >
            <TouchableOpacity
              key={group.id}
              onPress={() => onCount(group.id, 1)}
              onLongPress={() => openEditor(group)}
              className={`w-36 h-36 ${group.color} rounded-full items-center justify-center`}
            >
              <Text className="text-white font-bold">
                {group.name}
              </Text>
              <Text className="text-white text-4xl font-bold">
                +1
              </Text>
              <Text className="text-purple-200 mt-1">
                {counts[group.id] || 0}
              </Text>
            </TouchableOpacity>
          </View>
        ))}
      </View>

      {/* 設定モーダル */}
      <Modal visible={!!editGroup} transparent animationType="slide">
        <View className="flex-1 bg-black/40 justify-center items-center">
          <View className="bg-white w-80 p-6 rounded-2xl">

            {/** rename box */}
            <View className="items-center mb-4">
              {!renameMode ? (
                <TouchableOpacity
                  onPress={()=>setRenameMode(true)}
                >
                  <Text className="text-xl font-bold text-center">
                    {editGroup?.name}
                  </Text>
                  <Text className="text-xs text-gray-400 text-center mt-2">
                    タップして名前変更
                  </Text>
                </TouchableOpacity>
              ):(
                <View>
                  <TextInput
                  value={renameText}
                  onChangeText={setRenameText}
                  autoFocus
                  className="border border-gray-300 p-3 rounded-lg mb-3 text-center"
                  />
                  <TouchableOpacity
                    onPress={applyRename}
                    className="bg-green-600 py-2  rounded-lg  items-center"
                  >
                    <Text className="text-white text-sm font-bold">
                      名前を確定
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {/**counter box */}
            <View className="border p-3 border-gray-300 rounded-lg">
              <Text className="text-center text-gray-600 mb-2">来客数の変更</Text>
              <Text className="text-4xl text-center font-bold mb-6">
                {tempValue > 0 ? `+${tempValue}` : tempValue}
              </Text>

              <View className="flex-row justify-between mb-6">
                <TouchableOpacity
                  onPress={() => setTempValue((v) => v - 5)}
                  className="bg-gray-300 px-4 py-2 rounded-lg"
                >
                  <Text> -5 </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => setTempValue((v) => v - 1)}
                  className="bg-gray-300 px-4 py-2 rounded-lg"
                >
                  <Text> -1 </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => setTempValue((v) => v + 1)}
                  className="bg-purple-500 px-4 py-2 rounded-lg"
                >
                  <Text className="text-white">+1</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => setTempValue((v) => v + 5)}
                  className="bg-purple-500 px-4 py-2 rounded-lg"
                >
                  <Text className="text-white"> +5 </Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                onPress={applyChange}
                disabled={tempValue === 0}
                className={`py-3 rounded-xl items-center ${tempValue === 0 ? "bg-gray-400" : "bg-purple-700"}`}
              >
                <Text className="text-white font-bold">
                  変更を確定
                </Text>
              </TouchableOpacity>
            </View>


            {/**delete */}
            <TouchableOpacity
                className="mt-4 py-3 bg-red-500 rounded-xl items-center"
                onPress={() => {
                if (!editGroup) return;

                if (Platform.OS === "web") {
                  if (window.confirm("このグループを削除しますか？")) {
                    onDelete(editGroup.id);
                    setEditGroup(null);
                    setTempValue(0);
                  }
                } else {
                  Alert.alert(
                    "グループ削除",
                    "このグループを削除しますか？",
                    [
                      { text: "キャンセル", style: "cancel" },
                      {
                        text: "削除",
                        style: "destructive",
                        onPress: () => {
                          onDelete(editGroup.id);
                          setEditGroup(null);
                          setTempValue(0);
                        },
                      },
                    ]
                  );
                }
              }}
            >
              <Text className="text-white font-bold">
                グループ削除
              </Text>
            </TouchableOpacity>

              {/**cancel */}
            <TouchableOpacity
              onPress={() => {
                setEditGroup(null);
                setTempValue(0);
              }}
              className="mt-3 items-center"
            >
              <Text className="text-gray-500">
                キャンセル
              </Text>
            </TouchableOpacity>

          </View>

        </View>
      </Modal>

      {/* 説明文 */}
      <View className="mt-6">
        <Text className="text-gray-600 text-center text-sm">
          ※ 通常タップで +1 加算されます。
          長押しで調整画面が現れます。
        </Text>
        
      </View>

    </View>
  );
};
