export function getReplyingTo(tweet: APITweet) {
  if (tweet.replying_to_status) {
    return tweet.replying_to_status;
  }
  return tweet.replying_to_status ?? tweet.replying_to?.post ?? null;
}
