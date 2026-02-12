import { Text, TouchableOpacity, View } from "react-native";
import { TransactionWithItems } from "./SalesHistory";
import { Card } from "components/common";

interface TransactionCardProps{
  transaction:TransactionWithItems;
  onPress:(transaction:TransactionWithItems) => void;
  formatDate:(date:string) => string;
}

export const TransactionCard =({
  transaction,
  onPress,
  formatDate
}:TransactionCardProps)=>{
  
  const isCancelled = transaction.status === "cancelled";

  return(

    <Card className={`mb-3 ${isCancelled ? 'opacity-60 bg-gray-300' : ''}`}>
      <View className="flex-row items-center justify-between">
        {/**menu */}
        <View className="flex-1">
          <View className="flex-row transactions-center gap-2">
            <Text className="text-gray-500 text-sm">{formatDate(transaction.created_at)}</Text>
            {isCancelled && (
              <View className="bg-red-100 px-2 py-0.5 rounded">
                <Text className="text-red-600 text-xs font-medium">取消済</Text>
              </View>
            )}
          </View>
          <Text className="text-gray-700 text-xs mt-0.5">{transaction.transaction_code}</Text>
          <Text className="text-gray-900 mt-1" numberOfLines={1}>
            {transaction.items.map((i) => `${i.menu_name} x${i.quantity}`).join(', ')}
          </Text>
        </View>

        {/**payment */}
        <View className="items-end pr-4">
          <Text className={`text-lg font-bold ${isCancelled ? 'text-gray-400 line-through' : 'text-blue-600'}`}>
            {transaction.total_amount.toLocaleString()}円
          </Text>
          <View className={`px-2 py-0.5 rounded mt-1 ${
            transaction.payment_method === 'paypay' ? 'bg-blue-100'
              : transaction.payment_method === 'cash' ? 'bg-green-100'
              : 'bg-yellow-100'
          }`}>
            <Text className={`text-xs ${
              transaction.payment_method === 'paypay' ? 'text-blue-700'
                : transaction.payment_method === 'cash' ? 'text-green-700'
                : 'text-yellow-700'
            }`}>
              {transaction.payment_method === 'paypay' ? 'キャッシュレス' : transaction.payment_method === 'cash' ? '現金' : '金券'}
            </Text>
          </View>
        </View>

        {/**取り消しボタン */}
        {!isCancelled ? (
          <TouchableOpacity
            onPress={() => onPress(transaction)}
            activeOpacity={0.7}
            className="border border-red-400 px-4 py-1.5 rounded-full"
          >
            <Text className="text-red-500 text-sm font-mi">注文取消</Text>
          </TouchableOpacity>
        ):(
          <Text className="px-12 py-1.5 "></Text>
        )}
      </View>
    </Card>

  );
};