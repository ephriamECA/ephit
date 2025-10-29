# Step-by-Step Guide: Deploy to Render.com

This guide will take you from your local development setup to a live deployment on Render.

---

## 📋 Prerequisites

- [ ] GitHub account
- [ ] Render.com account (sign up at https://render.com)
- [ ] OpenAI API key (get from https://platform.openai.com/api-keys)
- [ ] Code pushed to GitHub

---

## Step 1: Push Your Code to GitHub

**1.1 Check your current status:**
```bash
cd /Users/ephriamkassa/Desktop/EphItUp/thirdopen/open-notebook
git status
```

**1.2 If you have uncommitted changes:**
```bash
git add .
git commit -m "Ready for Render deployment - added onboarding and API key management"
git push origin main
```

**If you haven't set up git remote:**
```bash
# Check if you have a remote
git remote -v

# If no remote, create one on GitHub first, then:
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git push -u origin main
```

---

## Step 2: Sign Up for Render

**2.1 Go to Render.com**
- Visit: https://dashboard.render.com
- Click "Get Started for Free"

**2.2 Sign up options:**
- Sign up with GitHub (recommended - easiest way to connect repos)
- Or sign up with email

**2.3 Verify your account** (if email signup)

---

## Step 3: Connect Your GitHub Repository

**3.1 In Render Dashboard:**
- Click **"New +"** button (top right)
- Select **"Blueprint"**

**3.2 Connect GitHub:**
- Click "Connect GitHub" or "Configure account"
- Authorize Render to access your repositories

**3.3 Select your repository:**
- Choose: `thirdopen` (or your repo name)
- Branch: `main`

**3.4 Render will detect your `render.yaml` automatically**

---

## Step 4: Configure Your Service

**Render will show you a configuration page. Verify these settings:**

**Service Type:** Web Service  
**Name:** ephitup (or your preferred name)  
**Region:** Select closest to you (e.g., Oregon)  
**Plan:** Starter (free) or upgrade if needed  
**Branch:** main  

**Review the detected settings:**
- Dockerfile: `Dockerfile.single` ✅
- Runtime: Docker ✅
- Health Check: `/` ✅

---

## Step 5: Add Environment Variables

**5.1 In the environment variables section, add these:**

### Required:
```bash
OPENAI_API_KEY=sk-your-actual-openai-key-here
```

### Generate JWT Secret:
```bash
# In your terminal:
python3 -c "import secrets; print(secrets.token_urlsafe(32))"

# Copy the output and add as:
JWT_SECRET=the-generated-secret-here
```

### Optional (for S3 podcast storage):
```bash
S3_BUCKET_NAME=your-bucket-name
S3_ENDPOINT_URL=your-endpoint-url
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
S3_REGION=us-east-2
```

**5.2 Mark sensitive variables as secrets:**
- Click the lock icon next to:
  - `OPENAI_API_KEY`
  - `JWT_SECRET`
  - Any AWS credentials

---

## Step 6: Start Deployment

**6.1 Click "Apply" or "Create Web Service"**

**6.2 Watch the build process:**
- This takes 5-10 minutes
- You'll see logs in real-time
- Build stages:
  1. Cloning repository ✅
  2. Building Docker image ✅
  3. Installing dependencies ✅
  4. Building frontend ✅
  5. Starting services ✅

**6.3 You'll see logs from:**
- SurrealDB starting
- FastAPI starting
- Worker starting
- Frontend starting

---

## Step 7: Wait for Deployment

**7.1 Monitor the logs:**
```bash
✅ Database running on port 8000
✅ API running on port 5055
✅ Worker running
✅ Frontend running on port 8502
```

**7.2 Check deployment status:**
- Status changes from "Building" → "Live" ✅
- You'll get a URL: `https://ephitup.onrender.com`

---

## Step 8: Verify Your Deployment

**8.1 Visit your site:**
```
https://ephitup.onrender.com
```

**8.2 Test the deployment:**
- [ ] Homepage loads
- [ ] Can register a new account
- [ ] Can log in
- [ ] Can see the notebooks page
- [ ] Can create a notebook

**8.3 Check logs if issues:**
- Click "Logs" in Render dashboard
- Look for any error messages

---

## Step 9: Run Database Migration

**9.1 SSH into your service (Optional):**
- In Render dashboard, click "Shell"
- This opens a terminal inside your container

**9.2 Apply migrations:**
```bash
# Connect to database
echo 'DEFINE FIELD has_completed_onboarding ON TABLE user TYPE bool DEFAULT false;' | psql

# Or use the migration file:
cd /app
surreal query --conn ws://localhost:8000 --user root --pass root --ns open_notebook --db production < migrations/13.surrealql
```

**Note:** Your migrations should run automatically, but if not, you can do this manually.

---

## Step 10: Make Yourself Admin (Optional)

**10.1 Find your user ID:**
- Go to Render dashboard → Logs
- Or register/login and check your profile

**10.2 Set yourself as admin:**
- In Render Shell, run:
```bash
python3
```

```python
from open_notebook.database.repository import repo_query
import asyncio

async def set_admin():
    users = await repo_query("SELECT * FROM user WHERE email = 'your-email@example.com'")
    if users:
        user_id = users[0]['id']
        await repo_query(f"UPDATE {user_id} SET is_admin = true")
        print("Admin set!")
    else:
        print("User not found")

asyncio.run(set_admin())
```

---

## Step 11: Configure Custom Domain (Optional)

**11.1 In Render Dashboard:**
- Go to your service
- Click "Settings"
- Scroll to "Custom Domains"
- Click "Add Custom Domain"

**11.2 Enter your domain:**
```
yourdomain.com
```

**11.3 Update DNS:**
Add a CNAME record:
```
Type: CNAME
Name: @
Value: ephitup.onrender.com
```

Wait for DNS propagation (5-60 minutes)

---

## Step 12: Monitor and Maintain

**12.1 Check your service health:**
- Render dashboard shows metrics
- Monitor CPU, Memory, Disk usage

**12.2 View logs:**
- Click "Logs" anytime to see what's happening
- Useful for debugging

**12.3 Manage environment variables:**
- Settings → Environment
- Add/update as needed

---

## 🎉 You're Live!

Your app is now accessible at:
```
https://ephitup.onrender.com
```

---

## 📊 What's Running

In one container on Render:
- ✅ SurrealDB (database)
- ✅ FastAPI (backend API)
- ✅ Worker (background processing)
- ✅ Next.js (frontend)

All managed by Supervisord, all accessible through one URL.

---

## 🔧 Troubleshooting

### Build Fails
**Problem:** Build times out or fails  
**Solution:** 
- Check Dockerfile.single is correct
- Ensure all dependencies are in requirements.txt
- Check Render logs for specific errors

### App Won't Start
**Problem:** Deployment shows "Live" but site doesn't load  
**Solution:**
- Check Environment Variables are set
- Verify OPENAI_API_KEY is correct
- Check logs for startup errors

### Database Issues
**Problem:** "Database not found" errors  
**Solution:**
- Run migrations (Step 9)
- Check /mydata directory is writable
- Verify database connection string

### Can't Access Admin Features
**Problem:** Can't see admin dashboard  
**Solution:**
- Set yourself as admin (Step 10)
- Ensure is_admin flag is true in database

---

## 🚀 Next Steps

1. **Test all features:**
   - Register/login
   - Create notebooks
   - Upload sources
   - Generate podcasts

2. **Invite users:**
   - Share your URL
   - Have them register
   - They'll see the onboarding tutorial

3. **Monitor usage:**
   - Check Render dashboard
   - Monitor API key usage
   - Track user growth

4. **Update your app:**
   ```bash
   git add .
   git commit -m "Your changes"
   git push origin main
   ```
   Render auto-deploys on push!

---

## 💡 Pro Tips

- **Free tier:** Spins down after 15 min inactivity, takes ~50s to wake up
- **Starter plan ($7/mo):** Always on, better performance
- **Monitor logs:** First place to check for issues
- **Environment variables:** Keep sensitive data encrypted
- **Database backup:** Render automatically backs up /mydata

---

## 📞 Need Help?

- Render Docs: https://render.com/docs
- Render Support: Available in dashboard
- Check logs in real-time
- Status page: https://status.render.com

---

**Congratulations! Your app is live on Render! 🎉**

