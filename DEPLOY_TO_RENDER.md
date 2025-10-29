# Deploying to Render.com - Step by Step Guide

## 📋 Prerequisites
- GitHub account
- Render.com account (free tier available)
- Your OpenAI API key
- Optional: AWS S3 credentials (for podcast audio storage)

## 🚀 Step 1: Push to GitHub

```bash
cd /Users/ephriamkassa/Desktop/EphItUp/thirdopen/open-notebook
git add .
git commit -m "Prepare for Render deployment"
git push origin main
```

## 🎯 Step 2: Connect to Render

1. Go to [Render Dashboard](https://dashboard.render.com)
2. Click **"New +"** → **"Blueprint"**
3. Connect your GitHub account (if not already connected)
4. Select your repository: `thirdopen` or your repo name
5. Select the branch: `main`

## ⚙️ Step 3: Configure the Service

Render will detect `render.yaml` automatically:

**Service Settings:**
- **Name**: `ephitup` (or your preferred name)
- **Region**: Choose closest to you
- **Plan**: `Starter` (free) or upgrade for better performance

## 🔐 Step 4: Set Environment Variables

In Render Dashboard, go to **Environment** section and add:

### Required:
- `OPENAI_API_KEY` - Your OpenAI API key (get from: https://platform.openai.com/api-keys)
  - **IMPORTANT**: Mark as "Secret" and sync to keep it private

### Optional (for AWS S3 podcast storage):
- `S3_BUCKET_NAME` - Your S3 bucket name or access point
- `S3_ENDPOINT_URL` - S3 endpoint URL (if using access point)
- `AWS_ACCESS_KEY_ID` - Your AWS access key
- `AWS_SECRET_ACCESS_KEY` - Your AWS secret key
- `S3_REGION` - AWS region (default: us-east-2)

### Auto-configured (from render.yaml):
- `SURREAL_URL` - ws://localhost:8000/rpc
- `SURREAL_USER` - root
- `SURREAL_PASSWORD` - Auto-generated
- `SURREAL_NAMESPACE` - open_notebook
- `SURREAL_DATABASE` - production
- `PORT` - 8502

## 🏗️ Step 5: Deploy

1. Click **"Apply"** or **"Create Web Service"**
2. Render will:
   - Clone your repository
   - Build the Docker image (takes 5-10 minutes)
   - Start all services (SurrealDB, API, Worker, Frontend)
3. Wait for deployment to complete (watch logs in real-time)

## ✅ Step 6: Access Your App

Your app will be available at:
- **URL**: `https://ephitup.onrender.com`
- **Or**: Check your specific URL in Render dashboard

## 🔍 Step 7: Verify Deployment

1. Open your app URL in browser
2. You should see the Open Notebook homepage
3. Try creating an account and logging in
4. Create a notebook to test functionality

## 📊 What's Running in the Container

Your single container includes:
- **SurrealDB** (database) - port 8000
- **FastAPI** (backend API) - port 5055
- **Worker** (background processing)
- **Next.js** (frontend) - port 8502

All managed by Supervisord.

## 🎛️ Monitoring & Logs

- View logs: Render Dashboard → Your Service → Logs
- Check status: Render Dashboard → Your Service → Metrics
- Set up alerts: Render Dashboard → Alerts

## 💰 Pricing

**Free Tier:**
- 750 hours/month (enough for 24/7 uptime on one service)
- Slower instance
- Spins down after 15 min inactivity (takes 50s to spin up)

**Starter Plan ($7/month):**
- More RAM (512MB → 1GB)
- Faster CPU
- Always-on (no spin down)
- Better performance

## 🔄 Updating Your Deployment

To update your app:
```bash
git add .
git commit -m "Your changes"
git push origin main
```
Render will automatically detect changes and redeploy!

## 🐛 Troubleshooting

### Build Fails
- Check Render logs for errors
- Ensure all dependencies are in requirements.txt
- Verify Dockerfile.single exists

### App Won't Start
- Check environment variables are set
- Verify OPENAI_API_KEY is valid
- Check logs for errors

### Frontend Issues
- Check browser console for errors
- Verify both ports are accessible
- Check API_URL configuration

### Database Issues
- Database persists in /mydata directory
- Check SurrealDB logs in Render
- Verify database credentials

## 📈 Scaling

If you need more resources:
1. Go to Render Dashboard
2. Select your service
3. Change plan (Starter → Standard → Pro)
4. Restart the service

## 🔒 Security Best Practices

1. Never commit API keys to Git
2. Use Render environment variables for secrets
3. Enable HTTPS (automatic on Render)
4. Keep dependencies updated
5. Monitor access logs

## 📝 Next Steps

After deployment:
1. Set admin user (run: `python3 scripts/set_admin.py <your-email>`)
2. Test podcast generation
3. Upload sources
4. Create notebooks

## 🎉 You're Live!

Your app is now deployed and accessible worldwide!

