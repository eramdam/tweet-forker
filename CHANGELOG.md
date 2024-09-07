# 2.0.0

- The `/u` endpoint has been renamed to `/fromTwitter`
- Add a `/fromMastodon` endpoint, this endpoint will post to:
  - Cohost
    - Content warnings and audio attachments are supported
  - Bluesky
    - If the Mastodon post is too long, it will be posted as a tweet with a link to the original post
    - If the Mastodon post has a content warning, it will be posted as a tweet with a link to the original post
  - Twitter
    - If the Mastodon post is too long, it will be posted as a tweet with a link to the original post
    - If the Mastodon post has a content warning, it will be posted as a tweet with a link to the original post
- media files are now stored in the `media` folder
