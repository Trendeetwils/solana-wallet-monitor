# Solana Wallet Monitor Telegram Bot

A production-ready Telegram bot that monitors Solana wallets for transactions in real-time and sends instant notifications.

## Features

- 📱 **Real-time Monitoring**: WebSocket subscriptions with polling fallback
- 💰 **SOL & SPL Tokens**: Tracks both native SOL and token transfers
- 🔔 **Instant Notifications**: Get notified immediately when transactions occur
- 🎛️ **Configurable Settings**: Adjust commitment levels and polling intervals
- 🔗 **Explorer Links**: Direct links to Solscan for each transaction
- 💾 **Persistent Storage**: SQLite database keeps your preferences
- 🛡️ **Duplicate Prevention**: Smart deduplication ensures no duplicate alerts
- 🔄 **Auto-Recovery**: Resumes monitoring after bot restarts

## Tech Stack

- **TypeScript** - Type-safe development
- **Node.js** - Runtime environment
- **Telegraf** - Telegram bot framework
- **@solana/web3.js** - Solana blockchain interaction
- **Prisma + SQLite** - Database ORM and storage

## Installation

### Prerequisites

- Node.js 18+ installed
- A Telegram bot token (get from [@BotFather](https://t.me/BotFather))
- Solana RPC endpoint (free or paid)

### Setup Steps

1. **Clone or create the project**
```bash
mkdir solana-wallet-monitor
cd solana-wallet-monitor
```

2. **Install dependencies**
```bash
npm install
```

3. **Configure environment variables**
```bash
cp .env.example .env
```

Edit `.env` and add your credentials:
```env
TELEGRAM_BOT_TOKEN=your_bot_token_here
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
```

4. **Initialize database**
```bash
npx prisma generate
npx prisma migrate dev --name init
```

5. **Run the bot**

Development mode (with auto-reload):
```bash
npm run dev
```

Production mode:
```bash
npm run build
npm start
```

## Usage

### Bot Commands

- `/start` - Initialize bot and set wallet address
- `/menu` - Show main control menu

### Main Menu Options

- **✅ Start Monitoring** - Begin watching for transactions
- **⏸ Stop Monitoring** - Pause transaction monitoring
- **🔁 Change Address** - Monitor a different wallet
- **ℹ️ Status** - View current monitoring status
- **⚙️ Settings** - Configure commitment level and poll interval

### Settings

**Commitment Levels:**
- **Processed**: Fastest notifications (~400ms), less secure
- **Confirmed**: Recommended balance (~1s)
- **Finalized**: Most secure (~13s), slower

**Poll Intervals:**
- 15 seconds to 2 minutes
- Only applies when using polling (not WebSocket)

## RPC Providers

### Free Options
- **Public Solana RPC**: `https://api.mainnet-beta.solana.com`
  - Limited rate limits
  - May not support WebSocket
  - Good for testing

### Paid Options (Recommended for Production)
- **Helius** (https://helius.dev) - $0-99/month
- **QuickNode** (https://quicknode.com) - $9-299/month
- **Alchemy** (https://alchemy.com) - Free tier available
- **Triton** (https://triton.one) - Enterprise solution

**Benefits of paid RPC:**
- Higher rate limits
- WebSocket support
- Better reliability
- Faster response times

## Deployment

### Option 1: Railway.app (Recommended)

1. Create account at [Railway.app](https://railway.app)
2. Install Railway CLI: `npm install -g @railway/cli`
3. Deploy:
```bash
railway login
railway init
railway up
```
4. Add environment variables in Railway dashboard
5. Cost: ~$5/month

### Option 2: Render.com

1. Create account at [Render.com](https://render.com)
2. Connect your GitHub repository
3. Create a new "Web Service"
4. Set build command: `npm install && npm run build && npx prisma generate`
5. Set start command: `npm start`
6. Add environment variables
7. Free tier available (with limitations)

### Option 3: VPS (DigitalOcean, Linode, Vultr)

1. Create a droplet/instance (minimum 1GB RAM)
2. SSH into server
3. Install Node.js 18+
4. Clone repository
5. Install dependencies and build
6. Use PM2 for process management:
```bash
npm install -g pm2
pm2 start dist/index.js --name solana-monitor
pm2 startup
pm2 save
```
7. Cost: $5-10/month

### Option 4: Docker

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build
RUN npx prisma generate

CMD ["npm", "start"]
```

Build and run:
```bash
docker build -t solana-monitor .
docker run -d --env-file .env solana-monitor
```

## Testing Checklist

### Basic Functionality
- [ ] Bot responds to /start command
- [ ] Can input valid Solana address
- [ ] Rejects invalid addresses
- [ ] Menu appears after address input
- [ ] Can start monitoring
- [ ] Can stop monitoring
- [ ] Can change wallet address

### Transaction Detection
- [ ] Receives notification for incoming SOL
- [ ] Receives notification for outgoing SOL
- [ ] Receives notification for SPL token transfers
- [ ] No duplicate notifications
- [ ] Correct transaction details shown
- [ ] Solscan links work

### Settings
- [ ] Can change commitment level
- [ ] Can change poll interval
- [ ] Settings persist after restart
- [ ] Monitoring restarts with new settings

### Edge Cases
- [ ] Bot recovers from RPC errors
- [ ] Bot handles network timeouts
- [ ] Monitoring resumes after bot restart
- [ ] Multiple users can monitor simultaneously
- [ ] Long wallet addresses display correctly

## Troubleshooting

### "Rate limit exceeded" errors
- Switch to a paid RPC provider
- Increase poll interval in settings
- Use WebSocket mode if available

### "Failed to start monitoring"
- Check RPC URL is correct
- Verify wallet address is valid
- Check internet connection
- Review bot logs for detailed errors

### Missing notifications
- Verify monitoring is active (check status)
- Test with a known transaction
- Check commitment level (try 'processed' for faster alerts)
- Verify RPC endpoint is working

### Database errors
- Run `npx prisma generate`
- Delete `dev.db` and run migrations again
- Check file permissions

## Development

### Project Structure
```
src/
├── bot/              # Telegram bot logic
│   ├── index.ts      # Bot initialization
│   ├── handlers.ts   # Command/callback handlers
│   └── keyboards.ts  # Inline keyboards
├── solana/           # Solana blockchain interaction
│   ├── monitor.ts    # Transaction monitoring
│   ├── validator.ts  # Address validation
│   └── parser.ts     # Transaction parsing
├── db/               # Database operations
│   └── index.ts      # Prisma queries
├── types/            # TypeScript types
│   └── index.ts
└── index.ts          # Entry point
```

### Database Schema
```prisma
model User {
  id                Int
  telegramId        String (unique)
  walletAddress     String
  lastSeenSignature String
  isMonitoring      Boolean
  commitmentLevel   String
  pollInterval      Int
  createdAt         DateTime
  updatedAt         DateTime
}
```

### Adding Features

**Add new commands:**
1. Add command handler in `src/bot/handlers.ts`
2. Register in `setupHandlers()`

**Modify transaction parsing:**
1. Edit `src/solana/parser.ts`
2. Update `TransactionNotification` type if needed

**Change monitoring logic:**
1. Modify `src/solana/monitor.ts`
2. Test with both WebSocket and polling modes

## Performance Tips

1. **Use WebSocket when possible** - Set `SOLANA_WS_URL` in `.env`
2. **Optimize poll intervals** - Balance between responsiveness and RPC costs
3. **Use 'confirmed' commitment** - Good balance of speed and reliability
4. **Monitor rate limits** - Implement exponential backoff if needed
5. **Database indexing** - Already optimized with Prisma

## Security Considerations

- Never commit `.env` file
- Store bot token securely
- Use environment variables in production
- Regularly update dependencies
- Monitor for unusual activity
- Implement rate limiting for user commands (if needed)

## License

MIT License - feel free to modify and use for your projects.

## Support

For issues or questions:
1. Check the troubleshooting section
2. Review bot logs
3. Test with a known working wallet
4. Verify RPC endpoint is operational

## Contributing

Contributions welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

---

Built with ❤️ for the Solana community