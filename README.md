# What's this?

This is a "manual crossposter" that takes a given tweet's URL, fetches the necessary data and posts it to your Mastodon account. This is useful to me because all the Twitter->Mastodon crossposters are either down, on the way out and/or don't properly support all of Twitter's features so I wanted a way to easily cherry-pick what tweets I wanted to cross-posts without too much overhead.

With the imminent demise of Twitter's API, this uses the API of [FixTweet](https://github.com/FixTweet/FixTweet) since I only need read access to a given tweet to work.

# What works

- [x] Text tweets
- [x] Pictures
- [ ] Videos

# Non-goals

- Polls
- Circles
- Visibility setting

# Setup

## Requirements

- Node.js v18
- A server to run the process/expose it to the web
- Create a `.env` file by following the example in `.env.example`
- Run the following

```
npm install
npm run build
npm run serve
```
