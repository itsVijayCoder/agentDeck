import { jsonResponse, withApiErrors } from "@/lib/api/errors";
import { authorizeApiRequest } from "@/lib/api/permissions";
import { generatePairingCode } from "@/lib/auth";

export async function POST() {
	return withApiErrors(async () => {
		const user = await authorizeApiRequest("machine:manage");
		const pairingCode = await generatePairingCode(user);

		return jsonResponse({ expiresInSeconds: 600, pairingCode }, { status: 201 });
	});
}
