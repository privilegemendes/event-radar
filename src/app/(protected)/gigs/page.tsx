import { redirect } from "next/navigation";

/** /gigs was renamed to /podiums — redirect for any bookmarks */
export default function GigsRedirect() {
  redirect("/podiums");
}
