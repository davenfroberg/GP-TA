const TermsOfService = () => {
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <main className="mx-auto max-w-4xl px-6 py-12">
        <div className="rounded-xl bg-white p-8 shadow-sm ring-1 ring-gray-200">
          <h1 className="text-3xl font-semibold text-gray-900">Terms of Service</h1>
          <p className="mt-2 text-sm text-gray-500">Last updated: December 9, 2025</p>

          <p className="mt-6 text-gray-700">
            This page provides default terms you can customize for your organization.
            By using this site or creating an account, you agree to these terms.
          </p>

          <div className="mt-8 space-y-6">
            <section>
              <h2 className="text-xl font-semibold text-gray-900">1. Use of the Service</h2>
              <p className="mt-2 text-gray-700">
                You may use the service for lawful purposes and in accordance with these terms.
                You are responsible for your account, the security of your login credentials,
                and all activity that occurs under your account.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900">2. Accounts and Security</h2>
              <p className="mt-2 text-gray-700">
                Keep your password confidential and notify us promptly of any unauthorized access
                or suspected breach. We may suspend access to protect the service and its users.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900">3. User Content</h2>
              <p className="mt-2 text-gray-700">
                You retain ownership of the content you submit. By posting content, you grant us
                a non-exclusive license to host, process, and display it as needed to operate the service.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900">4. Prohibited Activities</h2>
              <p className="mt-2 text-gray-700">
                Do not misuse the service, including by attempting to disrupt, reverse engineer,
                or access it in ways outside the provided interfaces, or by submitting unlawful,
                infringing, or harmful content.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900">5. Intellectual Property</h2>
              <p className="mt-2 text-gray-700">
                The service and its original content, features, and functionality are owned by us
                or our licensors and are protected by applicable laws. These terms do not grant
                you ownership in the service.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900">6. Disclaimers and Liability</h2>
              <p className="mt-2 text-gray-700">
                The service is provided on an &quot;as is&quot; and &quot;as available&quot; basis
                without warranties of any kind. To the fullest extent permitted by law, we are not
                liable for any indirect or consequential damages arising from your use of the service.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900">7. Termination</h2>
              <p className="mt-2 text-gray-700">
                We may suspend or terminate access if you violate these terms. You may stop using
                the service at any time. Certain provisions, including ownership and disclaimers,
                will survive termination.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900">8. Changes to These Terms</h2>
              <p className="mt-2 text-gray-700">
                We may update these terms periodically. Continued use after changes become effective
                constitutes acceptance of the revised terms.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900">9. Contact</h2>
              <p className="mt-2 text-gray-700">
                For questions about these terms, reach out to your site administrator or support team.
              </p>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
};

export default TermsOfService;

