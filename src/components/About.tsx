import React from 'react';

const About: React.FC = () => {
  return (
    <div className="max-w-4xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
      <h1 className="text-4xl font-bold mb-8 text-center text-gray-900">About 24Agents.Science</h1>
      
      <section className="mb-12 bg-white rounded-lg shadow-sm p-8">
        <h2 className="text-2xl font-semibold mb-4 text-gray-800">Our Mission</h2>
        <p className="text-gray-600 leading-relaxed">
          24Agents.Science is a collaborative platform bringing tools for agents in science to the community. 
        </p>
      </section>

      <section className="mb-12 bg-white rounded-lg shadow-sm p-8">
        <h2 className="text-2xl font-semibold mb-4 text-gray-800">What We Offer</h2>
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[
            'Advanced AI models accessible in one click',
            'Standardized model sharing platform',
            'Community-driven resource development',
            'Integration with bioimaging tools and workflows'
          ].map((item, index) => (
            <li key={index} className="flex items-start space-x-3">
              <svg className="h-6 w-6 text-green-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-gray-600">{item}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mb-12 bg-white rounded-lg shadow-sm p-8">
        <h2 className="text-2xl font-semibold mb-4 text-gray-800">Data Storage & Infrastructure</h2>
        <p className="text-gray-600 leading-relaxed">
          We store our models, datasets, and applications along with metadata in a dedicated S3 bucket 
          hosted at EMBL-EBI, and deposited to Zenodo as a backup. The resource metadata information is 
          indexed in a SQL database in the Hypha server hosted at KTH for searching and rendering on 
          the model zoo website.
        </p>
      </section>

      <section className="mb-12 bg-white rounded-lg shadow-sm p-8">
        <h2 className="text-2xl font-semibold mb-4 text-gray-800">Funding & Support</h2>
        <p className="text-gray-600 leading-relaxed mb-6">
          24Agents.Science receives funding from the Knut and Alice Wallenberg Foundation through the Data-Driven Life Science program.
        </p>
        <div className="flex flex-wrap items-center gap-6 mt-4">
          <img 
            src="/static/img/AI4Life-logo-giraffe.png" 
            alt="AI4Life Logo" 
            className="h-16 object-contain"
          />
          <img 
            src="/static/img/EuropeanFlag-Funded by the EU-POS.jpg" 
            alt="EU Flag" 
            className="h-16 object-contain"
          />
        </div>
      </section>
    </div>
  );
};

export default About; 