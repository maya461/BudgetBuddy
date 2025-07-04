import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Command } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import { createObjectCsvWriter } from 'csv-writer';

// __dirname replacement in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_FILE = path.join(__dirname, 'data.json');

const program = new Command();

function loadData() {
    if (!fs.existsSync(DATA_FILE)) {
        return { transactions: [], goals: {} };
    }
    const raw = fs.readFileSync(DATA_FILE, 'utf-8');
    return JSON.parse(raw);
}

function saveData(data) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

function calculateBalance(transactions) {
    let income = 0, expense = 0;
    for (const t of transactions) {
        if (t.type === 'income') income += t.amount;
        else expense += t.amount;
    }
    return income - expense;
}



function checkAlerts(transactions, goals) {
    const spentByCategory = {};
    let totalExpense = 0;
    for (const t of transactions) {
        if (t.type === 'expense') {
            spentByCategory[t.category] = (spentByCategory[t.category] || 0) + t.amount;
            totalExpense += t.amount;
        }
    }
    const alerts = [];
    for (const cat in goals) {
        if (cat === 'total') {
            if (totalExpense > goals[cat]) {
                alerts.push(`⚠️  Total spending exceeded goal! Spent: ${totalExpense}, Goal: ${goals[cat]}`);
            }
        } else {
            if ((spentByCategory[cat] || 0) > goals[cat]) {
                alerts.push(`⚠️  Spending in category "${cat}" exceeded goal! Spent: ${(spentByCategory[cat] || 0)}, Goal: ${goals[cat]}`);
            }
        }
    }
    return alerts;
}




program
    .name('budget')
    .description('CLI Budget Tracker')
    .version('1.0.0');

// Add transaction command
program
    .command('add')
    .description('Add a transaction')
    .argument('<type>', '"income" or "expense"')
    .argument('<amount>', 'Amount as a number')
    .argument('<category>', 'Category name')
    .argument('[description]', 'Description (optional)', '')
    .action((type, amount, category, description) => {
        type = type.toLowerCase();
        if (type !== 'income' && type !== 'expense') {
            console.log(chalk.red('Type must be "income" or "expense"'));
            process.exit(1);
        }
        amount = parseFloat(amount);
        if (isNaN(amount) || amount <= 0) {
            console.log(chalk.red('Amount must be a positive number'));
            process.exit(1);
        }

        const data = loadData();
        const transaction = {
            id: Date.now(),
            type,
            amount,
            category,
            description,
            date: new Date().toISOString().slice(0,10)
        };
        data.transactions.push(transaction);
        saveData(data);

        console.log(chalk.green(`Added ${type} of amount ${amount} in category "${category}"`));

        // Check alerts
        const alerts = checkAlerts(data.transactions, data.goals);
        alerts.forEach(a => console.log(chalk.yellow(a)));
    });

// Show balance
program
    .command('balance')
    .description('Show current balance')
    .action(() => {
        const data = loadData();
        const balance = calculateBalance(data.transactions);
        console.log(chalk.blue(`Current balance: ${balance.toFixed(2)}`));
    });

// List transactions
program
    .command('list')
    .description('List all transactions')
    .action(() => {
        const data = loadData();
        if (data.transactions.length === 0) {
            console.log('No transactions found.');
            return;
        }
        console.log(chalk.bold('ID       | Type    | Amount    | Category       | Description          | Date'));
        console.log('-------------------------------------------------------------------------------------');
        data.transactions.forEach(t => {
            console.log(
                `${t.id.toString().padEnd(8)} | ${t.type.padEnd(7)} | ${t.amount.toFixed(2).padEnd(9)} | ${t.category.padEnd(13)} | ${t.description.padEnd(18)} | ${t.date}`
            );
        });
    });

// Delete transaction
program
    .command('delete')
    .description('Delete a transaction by ID')
    .argument('<id>', 'Transaction ID')
    .action((id) => {
        const data = loadData();
        const beforeCount = data.transactions.length;
        data.transactions = data.transactions.filter(t => t.id.toString() !== id);
        if (data.transactions.length === beforeCount) {
            console.log(chalk.red('No transaction found with that ID'));
            return;
        }
        saveData(data);
        console.log(chalk.green(`Deleted transaction with ID ${id}`));
    });

// Export to CSV
program
    .command('export')
    .description('Export transactions to CSV file')
    .argument('[filename]', 'CSV file name', 'budget_export.csv')
    .action((filename) => {
        const data = loadData();
        if (data.transactions.length === 0) {
            console.log('No transactions to export.');
            return;
        }
        const csvWriter = createObjectCsvWriter({
            path: filename,
            header: [
                {id: 'id', title: 'ID'},
                {id: 'type', title: 'Type'},
                {id: 'amount', title: 'Amount'},
                {id: 'category', title: 'Category'},
                {id: 'description', title: 'Description'},
                {id: 'date', title: 'Date'}
            ]
        });
        csvWriter.writeRecords(data.transactions)
            .then(() => {
                console.log(chalk.green(`Exported ${data.transactions.length} transactions to ${filename}`));
            })
            .catch(err => {
                console.log(chalk.red('Error writing CSV:', err));
            });
    });

// Set budget goals
program
    .command('setgoal')
    .description('Set budget goal for a category or total')
    .argument('<category>', 'Category name or "total" for overall goal')
    .argument('<amount>', 'Goal amount')
    .action((category, amount) => {
        amount = parseFloat(amount);
        if (isNaN(amount) || amount <= 0) {
            console.log(chalk.red('Amount must be a positive number'));
            return;
        }
        const data = loadData();
        data.goals[category] = amount;
        saveData(data);
        console.log(chalk.green(`Set budget goal for "${category}" as ${amount}`));
    });

// Show budget goals
program
    .command('goals')
    .description('Show current budget goals')
    .action(() => {
        const data = loadData();
        if (!data.goals || Object.keys(data.goals).length === 0) {
            console.log('No budget goals set.');
            return;
        }
        console.log(chalk.bold('Category       | Goal'));
        console.log('------------------------');
        for (const [cat, val] of Object.entries(data.goals)) {
            console.log(`${cat.padEnd(14)} | ${val}`);
        }
    });

program.parse(process.argv);

if (!process.argv.slice(2).length) {
    program.outputHelp();
}
