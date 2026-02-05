import { Modal as RNModal, View, Text, TouchableOpacity, TouchableWithoutFeedback } from 'react-native';

interface ModalProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export const Modal = ({ visible, onClose, title, children }: ModalProps) => {
  return (
    <RNModal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View className="flex-1 bg-black/50 justify-center items-center p-4">
          <TouchableWithoutFeedback>
            <View className="bg-white rounded-2xl w-full max-w-md">
              <View className="flex-row items-center justify-between border-b border-gray-200 px-4 py-3">
                <Text className="text-lg font-semibold text-gray-900">{title}</Text>
                <TouchableOpacity onPress={onClose} className="p-1">
                  <Text className="text-gray-400 text-xl">x</Text>
                </TouchableOpacity>
              </View>
              <View className="p-4">{children}</View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </RNModal>
  );
};
