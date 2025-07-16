import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, addDoc, onSnapshot, query, orderBy, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

// Main App component
const App = () => {
  // State variables for Firebase, user, data, and UI
  const [app, setApp] = useState(null);
  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  const [userId, setUserId] = useState(null);
  const [allTransactions, setAllTransactions] = useState([]); // Stores all fetched transactions
  const [filteredTransactions, setFilteredTransactions] = useState([]); // Stores transactions after applying filters
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [modalMessage, setModalMessage] = useState('');

  // Form input states for adding new transactions
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Food');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]); // Default to today's date

  // Filter input states
  const [filterMonth, setFilterMonth] = useState(''); // 'MM' format or empty
  const [filterYear, setFilterYear] = useState(''); // 'YYYY' format or empty
  const [filterStartDate, setFilterStartDate] = useState(''); // 'YYYY-MM-DD' format or empty
  const [filterEndDate, setFilterEndDate] = useState(''); // 'YYYY-MM-DD' format or empty

  // Predefined categories
  const categories = [
    'Food', 'Transport', 'Entertainment', 'Utilities', 'Rent', 'Shopping',
    'Health', 'Education', 'Salary', 'Freelance', 'Investments', 'Other Income', 'Other Expense'
  ];

  // Ref for the transaction list to scroll to bottom
  const transactionsEndRef = useRef(null);

  // Initialize Firebase and set up authentication
  useEffect(() => {
    try {
      // Access global variables for Firebase configuration and auth token
      // For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyAmiDPsp0q4OqJPyZsoTA5WKWX9ugP8ic4",
  authDomain: "mymoneymanagerapp-36834.firebaseapp.com",
  projectId: "mymoneymanagerapp-36834",
  storageBucket: "mymoneymanagerapp-36834.firebasestorage.app",
  messagingSenderId: "7094438883",
  appId: "1:7094438883:web:8e245db07de9a8893b2ed6",
  measurementId: "G-8ZBE6E89WW"
};
      const appId = firebaseConfig.appId;
      const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

      // Initialize Firebase app
      const firebaseApp = initializeApp(firebaseConfig);
      setApp(firebaseApp);

      // Get Firestore and Auth instances
      const firestoreDb = getFirestore(firebaseApp);
      setDb(firestoreDb);
      const firebaseAuth = getAuth(firebaseApp);
      setAuth(firebaseAuth);

      // Listen for authentication state changes
      const unsubscribeAuth = onAuthStateChanged(firebaseAuth, async (user) => {
        if (user) {
          // User is signed in
          setUserId(user.uid);
          setLoading(false);
        } else {
          // User is signed out, attempt to sign in with custom token or anonymously
          try {
            if (initialAuthToken) {
              await signInWithCustomToken(firebaseAuth, initialAuthToken);
            } else {
              await signInAnonymously(firebaseAuth);
            }
          } catch (authError) {
            console.error("Firebase Auth Error:", authError);
            setError("Failed to authenticate. Please try again.");
            setLoading(false);
          }
        }
      });

      // Cleanup function for auth listener
      return () => unsubscribeAuth();
    } catch (err) {
      console.error("Firebase Initialization Error:", err);
      setError("Failed to initialize the application. Please check console for details.");
      setLoading(false);
    }
  }, []); // Run only once on component mount

  // Fetch all transactions from Firestore when userId and db are available
  useEffect(() => {
    if (db && userId) {
      const transactionsCollectionRef = collection(db, `artifacts/${__app_id}/users/${userId}/transactions`);
      const q = query(transactionsCollectionRef);

      // Set up real-time listener for transactions
      const unsubscribeTransactions = onSnapshot(q, (snapshot) => {
        const fetchedTransactions = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        // Sort transactions by date in descending order (newest first)
        fetchedTransactions.sort((a, b) => new Date(b.date) - new Date(a.date));
        setAllTransactions(fetchedTransactions); // Store all transactions
        setLoading(false);
        // Scroll to the bottom of the list when new transactions are added
        if (transactionsEndRef.current) {
          transactionsEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
      }, (err) => {
        console.error("Firestore Error:", err);
        setError("Failed to load transactions. Please try refreshing.");
        setLoading(false);
      });

      // Cleanup function for transactions listener
      return () => unsubscribeTransactions();
    }
  }, [db, userId]); // Re-run when db or userId changes

  // Apply filters whenever allTransactions or filter states change
  useEffect(() => {
    let tempTransactions = [...allTransactions];

    // Apply month and year filter
    if (filterMonth && filterYear) {
      tempTransactions = tempTransactions.filter(t => {
        const transactionDate = new Date(t.date);
        return transactionDate.getMonth() + 1 === parseInt(filterMonth) &&
               transactionDate.getFullYear() === parseInt(filterYear);
      });
    }

    // Apply date range filter
    if (filterStartDate && filterEndDate) {
      const start = new Date(filterStartDate);
      const end = new Date(filterEndDate);
      tempTransactions = tempTransactions.filter(t => {
        const transactionDate = new Date(t.date);
        return transactionDate >= start && transactionDate <= end;
      });
    }

    setFilteredTransactions(tempTransactions);
  }, [allTransactions, filterMonth, filterYear, filterStartDate, filterEndDate]);

  // Function to show a custom modal message
  const showCustomModal = (message) => {
    setModalMessage(message);
    setShowModal(true);
  };

  // Function to close the custom modal
  const closeCustomModal = () => {
    setShowModal(false);
    setModalMessage('');
  };

  // Handle adding a new transaction
  const handleAddTransaction = async (e) => {
    e.preventDefault();
    if (!amount || !description || !category || !date) {
      showCustomModal("Please fill in all transaction fields.");
      return;
    }
    if (isNaN(parseFloat(amount))) {
      showCustomModal("Amount must be a valid number.");
      return;
    }

    if (db && userId) {
      try {
        await addDoc(collection(db, `artifacts/${__app_id}/users/${userId}/transactions`), {
          amount: parseFloat(amount),
          description,
          category,
          date,
          type: (category === 'Salary' || category === 'Freelance' || category === 'Investments' || category === 'Other Income') ? 'income' : 'expense',
          createdAt: new Date().toISOString(), // Timestamp for creation
        });
        // Clear form fields after successful addition
        setAmount('');
        setDescription('');
        setCategory('Food');
        setDate(new Date().toISOString().split('T')[0]);
      } catch (err) {
        console.error("Error adding document: ", err);
        showCustomModal("Failed to add transaction. Please try again.");
      }
    } else {
      showCustomModal("Database not ready. Please wait or refresh.");
    }
  };

  // Handle deleting a transaction
  const handleDeleteTransaction = async (id) => {
    if (db && userId) {
      try {
        // Show confirmation modal
        showCustomModal(
          <div>
            <p>Are you sure you want to delete this transaction?</p>
            <div className="flex justify-center space-x-4 mt-4">
              <button
                onClick={async () => {
                  await deleteDoc(doc(db, `artifacts/${__app_id}/users/${userId}/transactions`, id));
                  closeCustomModal(); // Close modal after deletion
                }}
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
              >
                Delete
              </button>
              <button
                onClick={closeCustomModal}
                className="px-4 py-2 bg-gray-300 text-gray-800 rounded-md hover:bg-gray-400 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        );
      } catch (err) {
        console.error("Error deleting document: ", err);
        showCustomModal("Failed to delete transaction. Please try again.");
      }
    }
  };

  // Handle applying filters
  const handleApplyFilters = () => {
    // The useEffect hook already handles applying filters when state changes
    // This function can be used to trigger a re-render if needed, but not strictly necessary here
    // since state updates automatically trigger useEffect.
  };

  // Handle clearing all filters
  const handleClearFilters = () => {
    setFilterMonth('');
    setFilterYear('');
    setFilterStartDate('');
    setFilterEndDate('');
  };

  // Calculate total spending and income based on filtered transactions
  const totalSpending = filteredTransactions
    .filter(t => t.type === 'expense')
    .reduce((acc, t) => acc + t.amount, 0);

  const totalIncome = filteredTransactions
    .filter(t => t.type === 'income')
    .reduce((acc, t) => acc + t.amount, 0);

  const netBalance = totalIncome - totalSpending;

  // Group filtered transactions by category for summary and chart
  const spendingByCategory = filteredTransactions
    .filter(t => t.type === 'expense')
    .reduce((acc, t) => {
      acc[t.category] = (acc[t.category] || 0) + t.amount;
      return acc;
    }, {});

  const chartData = Object.keys(spendingByCategory).map(categoryName => ({
    category: categoryName,
    amount: spendingByCategory[categoryName],
  }));

  // Generate options for month and year filters
  const months = Array.from({ length: 12 }, (item, i) => {
    const month = (i + 1).toString().padStart(2, '0');
    const date = new Date(2000, i, 1); // Use a dummy date to get month name
    return { value: month, label: date.toLocaleString('default', { month: 'long' }) };
  });

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 10 }, (item, i) => currentYear - 5 + i); // 5 years back, 4 years forward

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
        <div className="text-xl font-semibold text-gray-700">Loading your money manager...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-red-100 p-4">
        <div className="text-xl font-semibold text-red-700">Error: {error}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 font-inter text-gray-800 p-4 sm:p-6 lg:p-8">
      {/* Custom Modal for alerts and confirmations */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl p-6 sm:p-8 max-w-sm w-full text-center">
            <p className="text-lg font-semibold mb-4">{modalMessage}</p>
            {/* If the message is not a confirmation, show a simple close button */}
            {!modalMessage.includes("Are you sure") && (
              <button
                onClick={closeCustomModal}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-md"
              >
                OK
              </button>
            )}
          </div>
        </div>
      )}

      <header className="text-center mb-8">
        <h1 className="text-4xl font-extrabold text-blue-800 mb-2">My Money Manager</h1>
        <p className="text-lg text-gray-600">Track your income and expenses effortlessly.</p>
        <p className="text-sm text-gray-500 mt-2">Your User ID: <span className="font-mono text-blue-700 break-all">{userId}</span></p>
      </header>

      <main className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Transaction Form */}
        <section className="bg-white rounded-2xl shadow-xl p-6 lg:col-span-1 h-fit">
          <h2 className="text-2xl font-bold text-blue-700 mb-6">Add New Transaction</h2>
          <form onSubmit={handleAddTransaction} className="space-y-4">
            <div>
              <label htmlFor="amount" className="block text-sm font-medium text-gray-700 mb-1">Amount</label>
              <input
                type="number"
                id="amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="e.g., 50.00"
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 transition-all"
                step="0.01"
                required
              />
            </div>
            <div>
              <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <input
                type="text"
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g., Coffee at Cafe X"
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 transition-all"
                required
              />
            </div>
            <div>
              <label htmlFor="category" className="block text-sm font-medium text-gray-700 mb-1">Category</label>
              <select
                id="category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 transition-all bg-white"
                required
              >
                {categories.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="date" className="block text-sm font-medium text-gray-700 mb-1">Date</label>
              <input
                type="date"
                id="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 transition-all"
                required
              />
            </div>
            <button
              type="submit"
              className="w-full bg-blue-600 text-white font-bold py-3 rounded-lg hover:bg-blue-700 transition-colors shadow-lg transform hover:scale-105"
            >
              Add Transaction
            </button>
          </form>
        </section>

        {/* Filters and Transaction List/Summary/Chart */}
        <section className="lg:col-span-2 grid grid-cols-1 gap-6">
          {/* Filter Section */}
          <div className="bg-white rounded-2xl shadow-xl p-6">
            <h2 className="text-2xl font-bold text-blue-700 mb-4">Filter Transactions</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
              <div>
                <label htmlFor="filterMonth" className="block text-sm font-medium text-gray-700 mb-1">Month</label>
                <select
                  id="filterMonth"
                  value={filterMonth}
                  onChange={(e) => setFilterMonth(e.target.value)}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 transition-all bg-white"
                >
                  <option value="">All Months</option>
                  {months.map(month => (
                    <option key={month.value} value={month.value}>{month.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="filterYear" className="block text-sm font-medium text-gray-700 mb-1">Year</label>
                <select
                  id="filterYear"
                  value={filterYear}
                  onChange={(e) => setFilterYear(e.target.value)}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 transition-all bg-white"
                >
                  <option value="">All Years</option>
                  {years.map(year => (
                    <option key={year} value={year}>{year}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="filterStartDate" className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                <input
                  type="date"
                  id="filterStartDate"
                  value={filterStartDate}
                  onChange={(e) => setFilterStartDate(e.target.value)}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 transition-all"
                />
              </div>
              <div>
                <label htmlFor="filterEndDate" className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
                <input
                  type="date"
                  id="filterEndDate"
                  value={filterEndDate}
                  onChange={(e) => setFilterEndDate(e.target.value)}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 transition-all"
                />
              </div>
            </div>
            <div className="flex justify-end space-x-3">
              <button
                onClick={handleClearFilters}
                className="px-5 py-2 bg-gray-200 text-gray-800 font-semibold rounded-lg hover:bg-gray-300 transition-colors shadow-md"
              >
                Clear Filters
              </button>
            </div>
          </div>

          {/* Financial Summary */}
          <div className="bg-white rounded-2xl shadow-xl p-6">
            <h2 className="text-2xl font-bold text-blue-700 mb-4">Financial Summary</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
              <div className="bg-green-50 p-4 rounded-xl shadow-md">
                <p className="text-sm text-gray-600">Total Income</p>
                <p className="text-2xl font-bold text-green-600">${totalIncome.toFixed(2)}</p>
              </div>
              <div className="bg-red-50 p-4 rounded-xl shadow-md">
                <p className="text-sm text-gray-600">Total Expenses</p>
                <p className="text-2xl font-bold text-red-600">${totalSpending.toFixed(2)}</p>
              </div>
              <div className={`p-4 rounded-xl shadow-md ${netBalance >= 0 ? 'bg-blue-50' : 'bg-orange-50'}`}>
                <p className="text-sm text-gray-600">Net Balance</p>
                <p className={`text-2xl font-bold ${netBalance >= 0 ? 'text-blue-600' : 'text-orange-600'}`}>${netBalance.toFixed(2)}</p>
              </div>
            </div>
          </div>

          {/* Spending by Category Chart */}
          <div className="bg-white rounded-2xl shadow-xl p-6">
            <h2 className="text-2xl font-bold text-blue-700 mb-4">Spending by Category</h2>
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart
                  data={chartData}
                  margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                  <XAxis dataKey="category" angle={-45} textAnchor="end" height={80} interval={0} style={{ fontSize: '12px' }} />
                  <YAxis />
                  <Tooltip formatter={(value) => `$${value.toFixed(2)}`} />
                  <Legend />
                  <Bar dataKey="amount" fill="#6366f1" radius={[10, 10, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-center text-gray-500">No expenses recorded for the selected filter to display chart.</p>
            )}
          </div>

          {/* Transaction History */}
          <div className="bg-white rounded-2xl shadow-xl p-6">
            <h2 className="text-2xl font-bold text-blue-700 mb-4">Transaction History</h2>
            {filteredTransactions.length === 0 ? (
              <p className="text-center text-gray-500">No transactions found for the selected filters.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {filteredTransactions.map((transaction) => (
                      <tr key={transaction.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{transaction.date}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{transaction.description}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{transaction.category}</td>
                        <td className={`px-6 py-4 whitespace-nowrap text-sm font-semibold ${transaction.type === 'expense' ? 'text-red-600' : 'text-green-600'}`}>
                          {transaction.type === 'expense' ? '-' : '+'}${transaction.amount.toFixed(2)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <button
                            onClick={() => handleDeleteTransaction(transaction.id)}
                            className="text-red-600 hover:text-red-900 transition-colors"
                            title="Delete Transaction"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 inline-block" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 000-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 011-1h4a1 1 0 110 2H8a1 1 0 01-1-1zm2 3a1 1 0 011-1h4a1 1 0 110 2H10a1 1 0 01-1-1zm-2 3a1 1 0 011-1h4a1 1 0 110 2H8a1 1 0 01-1-1z" clipRule="evenodd" />
                            </svg>
                          </button>
                        </td>
                      </tr>
                    ))}
                    <tr ref={transactionsEndRef} /> {/* Invisible element to scroll to */}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
};

export default App;
