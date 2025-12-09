export interface BankTransaction {
  id: string;
  date: string;
  payee: string;
  reference: string;
  amount: number;
  status: 'unmatched' | 'matched';
}

export interface Remittance {
  id: string;
  date: string;
  reference: string;
  client: string;
  orderNumber: string;
  amount: number;
  status: 'unmatched' | 'matched';
  matchedBankIds?: string[];
}

export const generateMockData = () => {
  const bankTransactions: BankTransaction[] = [];
  const remittances: Remittance[] = [];

  const payees = ['Stripe Payout', 'Wire Transfer', 'ACH Credit', 'Check Deposit', 'Intl Transfer'];
  const clients = ['Acme Corp', 'Globex Inc', 'Soylent Corp', 'Initech', 'Umbrella Corp', 'Cyberdyne', 'Massive Dynamic'];

  // Generate 100 bank transactions
  for (let i = 0; i < 50; i++) {
    const amount = Math.floor(Math.random() * 5000) + 100;
    bankTransactions.push({
      id: `bt-${i}`,
      date: new Date(2024, 0, Math.floor(Math.random() * 30) + 1).toISOString().split('T')[0],
      payee: payees[Math.floor(Math.random() * payees.length)],
      reference: Math.random().toString().slice(2, 10),
      amount: amount,
      status: 'unmatched'
    });
  }

  // Generate 50 remittances (some will match, some won't)
  for (let i = 0; i < 50; i++) {
    // 50% chance to create a perfect match for an existing bank transaction
    const shouldMatch = Math.random() > 0.5;
    let amount = Math.floor(Math.random() * 5000) + 100;
    
    if (shouldMatch && i < bankTransactions.length) {
      amount = bankTransactions[i].amount; // Perfect match amount
    }

    remittances.push({
      id: `rm-${i}`,
      date: new Date(2024, 0, Math.floor(Math.random() * 30) + 1).toISOString().split('T')[0],
      reference: `INV-${Math.floor(Math.random() * 10000)}`,
      client: clients[Math.floor(Math.random() * clients.length)],
      orderNumber: `ORD-${Math.floor(Math.random() * 99999)}`,
      amount: amount,
      status: 'unmatched'
    });
  }

  return { bankTransactions, remittances };
};
