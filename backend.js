const admin = require('firebase-admin');
const { JsonRpcProvider, Wallet, Contract } = require('ethers');
const serviceAccount = require("../e-detection-system-firebase-adminsdk-fbsvc-fdc9579bfb.json");
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
databaseURL: 'https://e-detection-system-e96dc-default-rtdb.asia-southeast1.firebasedatabase.app/'
 });

const provider = new JsonRpcProvider('https://powerful-autumn-cherry.ethereum-sepolia.quiknode.pro/8b5ba4fd00e486214a9b8af18536e21f91bf370e/');
const wallet = new Wallet('0d5ac20105f62949cad0fd2b45fb2db603cd7af4a00b9ce7ac54d0ed4de7013e', provider);

const contractABI = 
  [
	{
		"anonymous": false,
		"inputs": [
			{
				"indexed": false,
				"internalType": "uint256",
				"name": "timestamp",
				"type": "uint256"
			},
			{
				"indexed": false,
				"internalType": "int256",
				"name": "latitude",
				"type": "int256"
			},
			{
				"indexed": false,
				"internalType": "int256",
				"name": "longitude",
				"type": "int256"
			},
			{
				"indexed": false,
				"internalType": "uint8",
				"name": "severity",
				"type": "uint8"
			},
			{
				"indexed": false,
				"internalType": "address",
				"name": "reporter",
				"type": "address"
			}
		],
		"name": "PotholeReported",
		"type": "event"
	},
	{
		"inputs": [
			{
				"internalType": "uint256",
				"name": "index",
				"type": "uint256"
			}
		],
		"name": "getPothole",
		"outputs": [
			{
				"internalType": "uint256",
				"name": "timestamp",
				"type": "uint256"
			},
			{
				"internalType": "int256",
				"name": "latitude",
				"type": "int256"
			},
			{
				"internalType": "int256",
				"name": "longitude",
				"type": "int256"
			},
			{
				"internalType": "uint8",
				"name": "severity",
				"type": "uint8"
			},
			{
				"internalType": "address",
				"name": "reporter",
				"type": "address"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [],
		"name": "getPotholeCount",
		"outputs": [
			{
				"internalType": "uint256",
				"name": "count",
				"type": "uint256"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "uint256",
				"name": "",
				"type": "uint256"
			}
		],
		"name": "potholes",
		"outputs": [
			{
				"internalType": "uint256",
				"name": "timestamp",
				"type": "uint256"
			},
			{
				"internalType": "int256",
				"name": "latitude",
				"type": "int256"
			},
			{
				"internalType": "int256",
				"name": "longitude",
				"type": "int256"
			},
			{
				"internalType": "uint8",
				"name": "severity",
				"type": "uint8"
			},
			{
				"internalType": "address",
				"name": "reporter",
				"type": "address"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "int256",
				"name": "latitude",
				"type": "int256"
			},
			{
				"internalType": "int256",
				"name": "longitude",
				"type": "int256"
			},
			{
				"internalType": "uint8",
				"name": "severity",
				"type": "uint8"
			}
		],
		"name": "reportPothole",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	}

];

const contractAddress = '0xf4887b5c9f6b39ef93132e606aaa3e8710e310c0';
const contract = new Contract(contractAddress, contractABI, wallet);

const db = admin.database();
const potholesRef = db.ref('Potholes');

potholesRef.on('child_added', async (snapshot) => {
  const pothole = snapshot.val();

  // Your pothole.location likely has latitude and longitude as decimals.
  // Convert lat/lon to integers by multiplying by 1e7
  const latitudeInt = Math.round(pothole.latitude * 1e7);
  const longitudeInt = Math.round(pothole.longitude * 1e7);
const severityInt = parseInt(pothole.severity);

if (!isNaN(severityInt) && severityInt >= 1 && severityInt <= 5) {
      try {
      const tx = await contract.reportPothole(latitudeInt, longitudeInt, severityInt);
      console.log('Transaction sent:', tx.hash);
      await tx.wait();
      console.log('Transaction confirmed');
    } catch (error) {
      console.error('Error sending transaction:', error);
    }
  } else {
    console.log('Severity out of range:', severityInt);
  }
});

