import { jsonResponse, withApiErrors } from "@/lib/api/errors";
import { generatePairingCode, requireSession } from "@/lib/auth";

export async function POST() {
	return withApiErrors(async () => {
		const user = await requireSession();
		const pairingCode = await generatePairingCode(user);

		return jsonResponse({ expiresInSeconds: 600, pairingCode }, { status: 201 });
	});
}
