// Demo data: one chai stall with customers, prices, suppliers and two weeks of history.
// Used to fill an empty database on first run, and as the offline/local-mode starting point.
import type { AppData, Customer, Txn } from "./types.js";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export const SHOP_ID = id(1);

export function seedData(now = Date.now()): AppData {
  const ago = (days: number, hour = 9) => {
    const d = new Date(now - days * 86_400_000);
    d.setHours(hour, (days * 7) % 60, 0, 0);
    return d.toISOString();
  };
  const cust = (n: number, name: string, aliases: string[], phone: string | null, limit: number | null): Customer => ({
    id: id(100 + n), name, aliases, phone, credit_limit_paise: limit, view_token: id(900 + n), created_at: ago(30),
  });
  const customers = [
    cust(1, "Ramesh", ["Ramesh bhai", "रमेश", "driver"], "9876500001", 50000),
    cust(2, "Suresh", ["सुरेश"], "9876500002", 50000),
    cust(3, "Pappu", ["पप्पू"], "9876500003", 30000),
    cust(4, "Mohan", ["मोहन"], "9876500004", null),
    cust(5, "Sunita Didi", ["Sunita", "सुनीता"], "9876500005", null),
    cust(6, "Mahesh", ["महेश"], "9876500006", null),
    cust(7, "Imran", ["इमरान"], "9876500007", null),
    cust(8, "Lakshmi", ["लक्ष्मी", "Laxmi"], null, null),
  ];
  let t = 200;
  const tx = (c: number, type: Txn["type"], rupees: number, days: number, note: string | null = null, hour = 9): Txn => ({
    id: id(t++), customer_id: id(100 + c), type, amount_paise: rupees * 100, note, transcript: null,
    voided: false, disputed: false, created_at: ago(days, hour),
  });
  const transactions: Txn[] = [
    // Ramesh: regular, pays within a week
    tx(1, "credit", 60, 14), tx(1, "credit", 40, 12), tx(1, "payment", 100, 8),
    tx(1, "credit", 80, 5), tx(1, "credit", 40, 2), tx(1, "credit", 40, 0, "2 chai, 1 bun", 8),
    // Suresh: slow payer, old dues -> low Bharosa score
    tx(2, "credit", 200, 45), tx(2, "credit", 150, 38), tx(2, "credit", 250, 30), tx(2, "payment", 50, 20),
    // Pappu: small amounts, pays fast
    tx(3, "credit", 20, 6), tx(3, "payment", 20, 5), tx(3, "credit", 30, 3), tx(3, "payment", 30, 2), tx(3, "credit", 20, 1),
    // Mohan
    tx(4, "credit", 120, 9), tx(4, "credit", 35, 4, "2 chai, 1 bun"), tx(4, "payment", 50, 1),
    // Sunita Didi: good customer
    tx(5, "credit", 300, 20), tx(5, "payment", 300, 16), tx(5, "credit", 180, 3),
    // Mahesh
    tx(6, "credit", 90, 7), tx(6, "credit", 60, 0, null, 10),
    // Imran: paid everything
    tx(7, "credit", 75, 10), tx(7, "payment", 75, 6),
    // Lakshmi
    tx(8, "credit", 45, 2),
  ];
  transactions.push({ ...tx(2, "credit", 100, 25), disputed: true, note: "Customer ne vivaad kiya" });

  return {
    shop: { id: SHOP_ID, name: "Raju Chai Stall", upi_vpa: "rajuchai@okaxis", owner_phone: "9876500000" },
    customers,
    transactions,
    suppliers: [
      { id: id(50), name: "Gopal Doodhwala", phone: "9876500101" },
      { id: id(51), name: "Sharma Traders", phone: "9876500102" },
    ],
    items: [
      { id: id(60), name: "Chai", aliases: ["cha", "tea", "चाय"], price_paise: 1000, unit: "cup", supplier_id: null },
      { id: id(61), name: "Adrak Chai", aliases: ["adrak wali chai", "ginger tea"], price_paise: 1500, unit: "cup", supplier_id: null },
      { id: id(62), name: "Coffee", aliases: ["kafi", "कॉफी"], price_paise: 2000, unit: "cup", supplier_id: null },
      { id: id(63), name: "Bun", aliases: ["bun maska", "बन"], price_paise: 1500, unit: null, supplier_id: null },
      { id: id(64), name: "Biscuit", aliases: ["biskut", "parle"], price_paise: 1000, unit: "packet", supplier_id: id(51) },
      { id: id(65), name: "Samosa", aliases: ["समोसा"], price_paise: 1500, unit: null, supplier_id: null },
      { id: id(66), name: "Doodh", aliases: ["dudh", "milk", "दूध", "amul"], price_paise: null, unit: "packet", supplier_id: id(50) },
      { id: id(67), name: "Cheeni", aliases: ["chini", "sugar", "shakkar", "चीनी"], price_paise: null, unit: "kg", supplier_id: id(51) },
      { id: id(68), name: "Chai Patti", aliases: ["patti", "tea leaves", "चाय पत्ती"], price_paise: null, unit: "packet", supplier_id: id(51) },
    ],
    orders: [],
  };
}
