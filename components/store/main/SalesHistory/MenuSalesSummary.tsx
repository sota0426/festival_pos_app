import { Card, Header } from "components/common";
import { FlatList, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Branch, Transaction, TransactionItem } from "types/database";

interface TransactionWithItems extends Transaction{
  items:TransactionItem[];
}

interface MenuSales{
  menu_id:string;
  menu_name:string;
  quantity:number;
  subtotal:number;
}

interface MenuSalesSummayProps{
  branch:Branch;
  transactions:TransactionWithItems[];
  onBack:()=>void;
}

const aggregateMenuSales = (
  transactions:TransactionWithItems[]
):MenuSales[] =>{
  const map = new Map<string,MenuSales>();

  transactions.forEach((t)=>{
    if(t.status === "cancelled") return;

    t.items.forEach((item)=>{
      const current = map.get(item.menu_id);
      if(current){
        current.quantity += item.quantity;
        current.subtotal += item.subtotal
      }else{
        map.set(item.menu_id,{
          menu_id:item.menu_id,
          menu_name: item.menu_name,
          quantity:item.quantity,
          subtotal:item.subtotal
        });
      }
    });
  });

  return Array.from(map.values());
};


export const MenuSalesSummary =({
  branch,
  transactions,
  onBack
}:MenuSalesSummayProps)=>{
  const menuSales = aggregateMenuSales(transactions);

  return(
    <SafeAreaView>

      <FlatList 
        data={menuSales}
        keyExtractor={(item) => item.menu_id}
        contentContainerStyle={{padding:16}}
        renderItem={({item}) => (
          <Card className="mb-3">
            <View className="flex-row justify-between items-center">
              <View>
                <Text className="text-gray-900 font-medium">
                  {item.menu_name}
                </Text>

                <Text className="text-gray-500">
                  販売個数：{item.quantity}個
                </Text>
              </View>
              <Text className="text-lg font-bold text-blue-600">
                {item.subtotal.toLocaleString()} 円
              </Text>
            </View>
          </Card>
        )}

        ListEmptyComponent={
          <View className="items-center py-12">
            <Text className="text-gray-500">
              売り上げデータがありません
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  )
}