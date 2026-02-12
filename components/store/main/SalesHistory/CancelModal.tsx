import { Text, View } from "react-native";
import { TransactionWithItems } from "./SalesHistory";
import { Button, Modal } from "components/common";

interface CancelModalProps {
  visible: boolean;
  transaction: TransactionWithItems | null;
  cancelling: boolean;
  onClose: () => void;
  onCancelTransaction: (transaction: TransactionWithItems) => void;
  formatDate: (dateString: string) => string;
}

export const CancelModal = ({
  visible,
  transaction,
  cancelling,
  onClose,
  onCancelTransaction,
  formatDate
}: CancelModalProps) => {

	if(!transaction) return null;


	return(
		<Modal
			visible={visible}
			onClose={onClose}
			title="取引詳細"
	>
		<>
			<View className="mb-4">
				<Text className="text-gray-500 text-sm">取引番号</Text>
				<Text className="text-gray-900 font-medium">{transaction.transaction_code}</Text>
			</View>

			<View className="flex-row mb-4">
				<View className="flex-1">
					<Text className="text-gray-500 text-sm">日時</Text>
					<Text className="text-gray-900">{formatDate(transaction.created_at)}</Text>
				</View>
				<View className="flex-1">
					<Text className="text-gray-500 text-500">支払い方法</Text>
					<Text className="text-gray-900">
						{transaction.payment_method === "paypay"
							? "キャッシュレス"
							:transaction.payment_method === "cash"
								? "現金"
								: "金券"
						}
					</Text>
				</View>
			</View>
			
      {/* 注文内容 */}
        <View className="mb-4">
          <Text className="text-gray-500 text-sm mb-2">注文内容</Text>
					
					{transaction.items.map((item)=>(
						<View
							key={item.id}
							className="flex-row justify-between py-1 border-b border-gray-100 "
						>
							<Text className="text-gray-900">
								{item.menu_name} × {item.quantity}
							</Text>

							<Text className="text-gray-900">
								{item.subtotal.toString()}円
							</Text>
						</View>
					))}

					<View className="flex-row justify-between pt-2 my-2">
						<Text className="font-bold text-gray-900">合計</Text>
						<Text className="font-bold text-blue-600 text-xl">
							{transaction.total_amount.toString()}円
						</Text>
					</View>

					{/**cancel situation*/}
					{transaction.status === "cancelled" ? (
						<View className="bg-red-50 p-3 rounded-lg">
							<Text className="text-red-600 text-center">
								この取引は{formatDate(transaction.cancelled_at!)}に取消されました。
							</Text>
						</View>
					):(
						<Button
							title="この取引を取消"
							onPress={()=>onCancelTransaction(transaction)}
							variant="danger"
							loading={cancelling}
						/>
					)}

				</View>
			</>
		</Modal>
	);
};

