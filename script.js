class Block {
    constructor(index, timestamp, transactions, previousHash = "") {
        this.index = index;
        this.timestamp = timestamp;
        this.transactions = transactions;
        this.previousHash = previousHash;
        this.nonce = 0;
        this.hash = this.calculateHash();
    }

    calculateHash() {
        return sha256(this.index + this.timestamp + JSON.stringify(this.transactions) + this.previousHash + this.nonce).toString();
    }

    mineBlock(difficulty) {
        while (this.hash.substring(0, difficulty) !== Array(difficulty + 1).join("0")) {
            this.nonce++;
            this.hash = this.calculateHash();
        }
        console.log(`Block mined: ${this.hash}`);
    }
}

class Blockchain {
    constructor() {
        this.chain = [this.createGenesisBlock()];
        this.difficulty = 3;
        this.pendingTransactions = [];
        this.voters = new Set();
    }

    createGenesisBlock() {
        return new Block(0, "01/01/2025", "Genesis Block", "0");
    }

    getLatestBlock() {
        return this.chain[this.chain.length - 1];
    }

    addTransaction(transaction) {
        if (this.voters.has(transaction.voter)) {
            alert("You have already voted! Multiple votes are not allowed.");
            return false;
        }
        
        this.pendingTransactions.push(transaction);
        this.voters.add(transaction.voter);
        return true;
    }

    minePendingTransactions() {
        let block = new Block(this.chain.length, new Date().toLocaleString(), this.pendingTransactions, this.getLatestBlock().hash);
        block.mineBlock(this.difficulty);
        this.chain.push(block);
        this.pendingTransactions = [];
    }

    isChainValid() {
        for (let i = 1; i < this.chain.length; i++) {
            const currentBlock = this.chain[i];
            const previousBlock = this.chain[i - 1];

            if (currentBlock.hash !== currentBlock.calculateHash()) {
                return false;
            }

            if (currentBlock.previousHash !== previousBlock.hash) {
                return false;
            }
        }
        return true;
    }
}

// Initialize blockchain and candidates
const votingBlockchain = new Blockchain();
let currentVoter = null;
let candidates = [];

function addCandidate() {
    let candidateName = document.getElementById("candidate-name").value.trim();
    
    if (candidateName === "") {
        alert("Please enter a candidate name.");
        return;
    }

    candidates.push(candidateName);
    let li = document.createElement("li");
    li.textContent = candidateName;
    document.getElementById("candidate-list").appendChild(li);
    document.getElementById("candidate-name").value = "";
}

function startVoting() {
    if (candidates.length === 0) {
        alert("Please add at least one candidate.");
        return;
    }

    document.getElementById("setup-section").style.display = "none";
    document.getElementById("voter-section").style.display = "block";
}

function registerVoter() {
    let voterName = document.getElementById("voter-name").value.trim();
    
    if (voterName === "") {
        alert("Please enter your name to vote.");
        return;
    }

    currentVoter = voterName;
    document.getElementById("voter-section").style.display = "none";
    document.getElementById("vote-section").style.display = "block";
    document.getElementById("voter-display").innerText = currentVoter;

    generateCandidateButtons();
}

function generateCandidateButtons() {
    let candidateButtons = document.getElementById("candidate-buttons");
    candidateButtons.innerHTML = "";

    candidates.forEach(candidate => {
        let button = document.createElement("button");
        button.textContent = `Vote ${candidate}`;
        button.onclick = function () {
            vote(candidate);
        };
        candidateButtons.appendChild(button);
    });
}

function vote(candidate) {
    if (!currentVoter) {
        alert("You must enter your name before voting.");
        return;
    }

    const voteTransaction = {
        voter: currentVoter,
        candidate: candidate,
        timestamp: new Date().toLocaleString()
    };

    if (votingBlockchain.addTransaction(voteTransaction)) {
        votingBlockchain.minePendingTransactions();
        updateLedger();
        alert(`Thank you, ${currentVoter}! Your vote for ${candidate} has been recorded.`);
        
        document.getElementById("vote-section").style.display = "none";
    }
}

function updateLedger() {
    let ledger = document.getElementById("ledger");
    ledger.innerHTML = "";

    votingBlockchain.chain.forEach(block => {
        let li = document.createElement("li");
        li.textContent = `Block ${block.index} | Hash: ${block.hash} | Transactions: ${JSON.stringify(block.transactions)}`;
        ledger.appendChild(li);
    });
}
