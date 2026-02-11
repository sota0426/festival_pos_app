import { Platform, Text, View } from "react-native";

export function MissingEnvScreen(){
  return(
    <View className="flex-1 items-center justify-center bg-white px-6">
      <Text className="mb-3 text-2xl font-bold text-red-600">
        Configuration 
      </Text>

      <Text className="mb-4 text-center text-gray-600">
        Please check your .env file and restart Expo.
      </Text>

      {__DEV__ &&(
        <View className="mt-6 w-full rounded-xl bg-gray-100 p-4">
          <Text className="mb-2 font-bold text-gray-700">
            Debug info
          </Text>

          <Text className="text-xs text-gray-600">
            EXPO_PUBLIC_SUPABASE_URL:{''}
            {String(process.env.EXPO_PUBLIC_SUPABASE_URL)}
          </Text>

          <Text className="text-xs text-gray-600">
            EXPO_PUBLIC_SUPABASE_ANON_KEY:{''}
            {String(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ? "SET" :"NOT SET")}
          </Text>
          
          <Text className="text-xs text-gray-600">
            Platform : {Platform.OS}
          </Text>
        </View>
      )}
    </View>
  )
}
