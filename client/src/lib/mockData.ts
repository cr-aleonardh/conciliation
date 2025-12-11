export interface BankTransaction {
  id: string;
  date: string;
  payee: string;
  reference: string;
  amount: number;
  status: 'unmatched' | 'matched' | 'suggested';
}

export interface Remittance {
  id: string;
  date: string;
  reference: string;
  client: string;
  orderNumber: string;
  amount: number;
  status: 'unmatched' | 'matched' | 'suggested';
  matchedBankIds?: string[];
  suggestedMatchId?: string; // For 1-to-1 suggestions
}

export const generateMockData = () => {
  const bankTransactions: BankTransaction[] = [];
  const remittances: Remittance[] = [];

  const payees = ['Stripe Payout', 'Wire Transfer', 'ACH Credit', 'Check Deposit', 'Intl Transfer'];
  const clients = ['Acme Corp', 'Globex Inc', 'Soylent Corp', 'Initech', 'Umbrella Corp', 'Cyberdyne', 'Massive Dynamic'];

  const generateReference = () => {
    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const char1 = letters.charAt(Math.floor(Math.random() * letters.length));
    const char2 = letters.charAt(Math.floor(Math.random() * letters.length));
    const digits = Math.floor(Math.random() * 1000000).toString().padStart(6, '0');
    return `${char1}${char2}${digits}`;
  };

  // Generate 100 bank transactions
  for (let i = 0; i < 50; i++) {
    const amount = Math.floor(Math.random() * 5000) + 100;
    bankTransactions.push({
      id: `bt-${i}`,
      date: new Date(2024, 0, Math.floor(Math.random() * 30) + 1).toISOString().split('T')[0],
      payee: payees[Math.floor(Math.random() * payees.length)],
      reference: generateReference(),
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
      reference: generateReference(),
      client: clients[Math.floor(Math.random() * clients.length)],
      orderNumber: `ORD-${Math.floor(Math.random() * 10000000).toString().padStart(7, '0')}`,
      amount: amount,
      status: 'unmatched'
    });
  }

  // Generate some matched data
  // ... existing matched logic if any ...

  // Generate Suggestions (1-to-1)
  for (let i = 0; i < 3; i++) {
     const amount = Math.floor(Math.random() * 5000) + 1000;
     const idSuffix = `_sug_${i}`;
     
     const bankTx: BankTransaction = {
       id: `bank${idSuffix}`,
       date: '2023-12-05',
       amount,
       payee: `Suggested Client ${i}`,
       reference: generateReference(),
       status: 'suggested'
     };

     const remit: Remittance = {
       id: `remit${idSuffix}`,
       date: '2023-12-05',
       amount,
       client: `Suggested Client ${i}`,
       reference: generateReference(),
       orderNumber: `ORD-${i.toString().padStart(7, '0')}`,
       status: 'suggested',
       suggestedMatchId: bankTx.id
     };

     bankTransactions.push(bankTx);
     remittances.push(remit);
  }

  return { bankTransactions, remittances };
};
