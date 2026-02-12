import { alertNotify } from "lib/alertUtils";
import { Platform } from "react-native";
import { Branch } from "types/database";
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { TransactionWithItems } from "./SalesHistory";

// CSV export
const generateCSV = (transactions:TransactionWithItems[]): string => {
  const completedTrans = transactions.filter((t) => t.status === 'completed');

  // Header
  const headers = [
    '取引番号',
    '日時',
    '支払い方法',
    'メニュー名',
    '単価',
    '数量',
    '小計',
    '取引合計',
  ];

  const rows: string[][] = [];

  completedTrans.forEach((t) => {
    const dateStr = new Date(t.created_at).toLocaleString('ja-JP');
    const methodLabel =
      t.payment_method === 'paypay' ? 'キャッシュレス' : t.payment_method === 'cash' ? '現金' : '金券';

    t.items.forEach((item) => {
      rows.push([
        t.transaction_code,
        dateStr,
        methodLabel,
        item.menu_name,
        item.unit_price.toString(),
        item.quantity.toString(),
        item.subtotal.toString(),
        t.total_amount.toString(),
      ]);
    });
  });

  // Menu summary section
  const menuMap = new Map<string, { name: string; qty: number; total: number }>();
  completedTrans.forEach((t) => {
    t.items.forEach((item) => {
      const existing = menuMap.get(item.menu_id);
      if (existing) {
        existing.qty += item.quantity;
        existing.total += item.subtotal;
      } else {
        menuMap.set(item.menu_id, {
          name: item.menu_name,
          qty: item.quantity,
          total: item.subtotal,
        });
      }
    });
  });

  const totalSalesAmount = completedTrans.reduce((sum, t) => sum + t.total_amount, 0);

  let csv = '\uFEFF'; // BOM for Excel UTF-8
  csv += headers.join(',') + '\n';
  rows.forEach((row) => {
    csv += row.map((cell) => `"${cell}"`).join(',') + '\n';
  });

  csv += '\n';
  csv += '"メニュー別集計"\n';
  csv += '"メニュー名","販売数量","売上合計"\n';
  Array.from(menuMap.values()).forEach((m) => {
    csv += `"${m.name}","${m.qty}","${m.total}"\n`;
  });

  csv += '\n';
  csv += `"総売上","","${totalSalesAmount}"\n`;
  csv += `"取引件数","","${completedTrans.length}"\n`;

  return csv;
};


interface Props{
  transactions:TransactionWithItems[];
  branch:Branch;
}

export const handleExportCSV = async ({
  transactions,
  branch,
}:Props) => {
 
    const csv = generateCSV(transactions);
    const filename = `sales_${branch.branch_code}_${new Date().toISOString().split('T')[0]}.csv`;

    if (Platform.OS === 'web') {
      // Web: Blob download
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
      alertNotify('完了', 'CSVファイルをダウンロードしました');
    } else {
      // Native: expo-file-system (new API) + expo-sharing
      try {
        const file = new File(Paths.cache, filename);
        file.create();
        file.write(csv);
        await Sharing.shareAsync(file.uri, {
          mimeType: 'text/csv',
          dialogTitle: '売上データCSV',
          UTI: 'public.comma-separated-values-text',
        });
      } catch (error) {
        console.error('Error exporting CSV:', error);
        alertNotify('エラー', 'CSV出力に失敗しました');
      }
    }
  };