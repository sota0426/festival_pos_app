import { Text, View, TouchableOpacity } from 'react-native';

interface HeaderProps {
  title: string;
  subtitle?: string;
  subtitleElement?: React.ReactNode;
  showBack?: boolean;
  onBack?: () => void;
  titleLeftElement?: React.ReactNode;
  rightElement?: React.ReactNode;
}

export const Header = ({ title, subtitle, subtitleElement, showBack = false, onBack, titleLeftElement, rightElement }: HeaderProps) => {
  return (
    <View className="bg-white border-b border-gray-200 px-4 py-4">
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center flex-1">
          {showBack && (
            <TouchableOpacity onPress={onBack} className="mr-3 p-1">
              <Text className="text-blue-600 text-lg">{'<'}</Text>
            </TouchableOpacity>
          )}
          <View className="flex-1">
            <View className="flex-row items-center gap-2">
              {titleLeftElement}
              <Text className="text-xl font-bold text-gray-900 flex-shrink">{title}</Text>
            </View>
            {subtitleElement ? subtitleElement : subtitle ? <Text className="text-sm text-gray-500 mt-0.5">{subtitle}</Text> : null}
          </View>
        </View>
        {rightElement && <View>{rightElement}</View>}
      </View>
    </View>
  );
};
