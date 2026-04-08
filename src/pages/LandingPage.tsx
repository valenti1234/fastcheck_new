import React from 'react';
import { Link } from 'react-router-dom';
import { CheckSquare, Shield, BarChart2, Upload, Database, Users, FileText, AlertTriangle } from 'lucide-react';
import duxiterLogo from '../assets/duxiter_logo.png';

const LandingPage: React.FC = () => {
  return (
    <div className="bg-white">
      {/* Header */}
      <header className="relative bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex justify-between items-center py-6 md:justify-start md:space-x-10">
            <div className="flex justify-start lg:w-0 lg:flex-1">
              <a href="#" className="flex items-center">
                <img src={duxiterLogo} alt="Duxiter Logo" className="h-8 w-auto" />
                <span className="ml-2 text-xl font-bold text-gray-900">Duxiter Fast Check</span>
              </a>
            </div>
            <div className="hidden md:flex items-center justify-end md:flex-1 lg:w-0">
              <Link to="/login" className="whitespace-nowrap text-base font-medium text-gray-500 hover:text-gray-900">
                Iniciar sesión
              </Link>
              <Link to="/register" className="ml-8 whitespace-nowrap inline-flex items-center justify-center px-4 py-2 border border-transparent rounded-md shadow-sm text-base font-medium text-white bg-primary-600 hover:bg-primary-700">
                Registrarse
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Hero section */}
      <div className="relative bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-24 lg:py-32">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
            <div>
              <h1 className="text-4xl font-extrabold tracking-tight text-gray-900 sm:text-5xl md:text-6xl">
                <span className="block text-primary-600">Evaluación masiva</span>
                <span className="block">de proveedores en Chile</span>
              </h1>
              <p className="mt-6 text-xl text-gray-500">
                Evalúe a sus proveedores de forma rápida y efectiva. Acceda a información legal, comercial, judicial y regulatoria con solo ingresar el RUT.
              </p>
              <div className="mt-10 flex space-x-4">
                <Link to="/register" className="inline-flex items-center justify-center px-5 py-3 border border-transparent text-base font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 md:text-lg">
                  Comenzar ahora
                </Link>
                <a href="#features" className="inline-flex items-center justify-center px-5 py-3 border border-transparent text-base font-medium rounded-md text-primary-700 bg-primary-100 hover:bg-primary-200 md:text-lg">
                  Conocer más
                </a>
              </div>
            </div>
            <div className="hidden md:block">
              <img 
                className="rounded-lg shadow-xl animate-pulse-slow" 
                src="https://images.pexels.com/photos/590016/pexels-photo-590016.jpeg?auto=compress&cs=tinysrgb&w=800" 
                alt="Dashboard de evaluación de proveedores" 
              />
            </div>
          </div>
        </div>
      </div>

      {/* Features section */}
      <div id="features" className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h2 className="text-3xl font-extrabold text-gray-900 sm:text-4xl">
              Evaluación completa en minutos
            </h2>
            <p className="mt-4 max-w-2xl text-xl text-gray-500 mx-auto">
              Duxiter Fast Check le permite evaluar proveedores chilenos con toda la información relevante en un solo lugar.
            </p>
          </div>

          <div className="mt-20">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              <div className="bg-gray-50 rounded-lg p-6 border border-gray-100 transform transition duration-500 hover:scale-105">
                <div className="inline-flex items-center justify-center p-3 bg-primary-100 rounded-md text-primary-600">
                  <Shield className="h-6 w-6" />
                </div>
                <h3 className="mt-4 text-lg font-medium text-gray-900">Validación RUT</h3>
                <p className="mt-2 text-base text-gray-500">
                  Verificamos que el RUT sea válido y corresponda a una empresa legalmente constituida en Chile.
                </p>
              </div>

              <div className="bg-gray-50 rounded-lg p-6 border border-gray-100 transform transition duration-500 hover:scale-105">
                <div className="inline-flex items-center justify-center p-3 bg-secondary-100 rounded-md text-secondary-600">
                  <BarChart2 className="h-6 w-6" />
                </div>
                <h3 className="mt-4 text-lg font-medium text-gray-900">Riesgo Financiero</h3>
                <p className="mt-2 text-base text-gray-500">
                  Evaluamos la situación financiera, calificación crediticia y riesgo comercial del proveedor.
                </p>
              </div>

              <div className="bg-gray-50 rounded-lg p-6 border border-gray-100 transform transition duration-500 hover:scale-105">
                <div className="inline-flex items-center justify-center p-3 bg-accent-100 rounded-md text-accent-600">
                  <AlertTriangle className="h-6 w-6" />
                </div>
                <h3 className="mt-4 text-lg font-medium text-gray-900">Alertas Judiciales</h3>
                <p className="mt-2 text-base text-gray-500">
                  Detectamos antecedentes judiciales, litigios pendientes y procesos legales que puedan afectar la relación comercial.
                </p>
              </div>

              <div className="bg-gray-50 rounded-lg p-6 border border-gray-100 transform transition duration-500 hover:scale-105">
                <div className="inline-flex items-center justify-center p-3 bg-primary-100 rounded-md text-primary-600">
                  <Upload className="h-6 w-6" />
                </div>
                <h3 className="mt-4 text-lg font-medium text-gray-900">Evaluaciones Masivas</h3>
                <p className="mt-2 text-base text-gray-500">
                  Suba un archivo CSV o Excel con múltiples proveedores y obtenga resultados en minutos para todo su directorio.
                </p>
              </div>

              <div className="bg-gray-50 rounded-lg p-6 border border-gray-100 transform transition duration-500 hover:scale-105">
                <div className="inline-flex items-center justify-center p-3 bg-secondary-100 rounded-md text-secondary-600">
                  <Database className="h-6 w-6" />
                </div>
                <h3 className="mt-4 text-lg font-medium text-gray-900">Reportes Completos</h3>
                <p className="mt-2 text-base text-gray-500">
                  Generamos reportes detallados con toda la información relevante y recomendaciones para la toma de decisiones.
                </p>
              </div>

              <div className="bg-gray-50 rounded-lg p-6 border border-gray-100 transform transition duration-500 hover:scale-105">
                <div className="inline-flex items-center justify-center p-3 bg-accent-100 rounded-md text-accent-600">
                  <Users className="h-6 w-6" />
                </div>
                <h3 className="mt-4 text-lg font-medium text-gray-900">Multi-Tenant</h3>
                <p className="mt-2 text-base text-gray-500">
                  Administre múltiples usuarios y roles dentro de su organización con diferentes niveles de acceso.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* How it works section */}
      <div className="py-16 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h2 className="text-3xl font-extrabold text-gray-900 sm:text-4xl">
              Cómo funciona
            </h2>
            <p className="mt-4 max-w-2xl text-xl text-gray-500 mx-auto">
              Un proceso simple y efectivo para evaluar a sus proveedores.
            </p>
          </div>

          <div className="mt-20">
            <div className="relative">
              <div className="absolute inset-0 flex items-center" aria-hidden="true">
                <div className="w-full border-t border-gray-300"></div>
              </div>
              <div className="relative flex justify-between">
                <div className="bg-white px-4">
                  <span className="h-10 w-10 rounded-full bg-primary-600 flex items-center justify-center text-white font-medium">
                    1
                  </span>
                </div>
                <div className="bg-white px-4">
                  <span className="h-10 w-10 rounded-full bg-primary-600 flex items-center justify-center text-white font-medium">
                    2
                  </span>
                </div>
                <div className="bg-white px-4">
                  <span className="h-10 w-10 rounded-full bg-primary-600 flex items-center justify-center text-white font-medium">
                    3
                  </span>
                </div>
                <div className="bg-white px-4">
                  <span className="h-10 w-10 rounded-full bg-primary-600 flex items-center justify-center text-white font-medium">
                    4
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-10 grid grid-cols-1 md:grid-cols-4 gap-8">
              <div className="text-center">
                <h3 className="text-lg font-medium text-gray-900">Registre su cuenta</h3>
                <p className="mt-2 text-base text-gray-500">
                  Cree una cuenta para su empresa y configure su equipo de trabajo con diferentes roles.
                </p>
              </div>

              <div className="text-center">
                <h3 className="text-lg font-medium text-gray-900">Ingrese RUT o cargue archivo</h3>
                <p className="mt-2 text-base text-gray-500">
                  Ingrese manualmente el RUT de un proveedor o cargue un archivo con múltiples proveedores.
                </p>
              </div>

              <div className="text-center">
                <h3 className="text-lg font-medium text-gray-900">Obtenga resultados</h3>
                <p className="mt-2 text-base text-gray-500">
                  Nuestro sistema procesa la información y genera un informe completo con todos los antecedentes.
                </p>
              </div>

              <div className="text-center">
                <h3 className="text-lg font-medium text-gray-900">Tome decisiones informadas</h3>
                <p className="mt-2 text-base text-gray-500">
                  Utilice los resultados para evaluar riesgos y tomar decisiones estratégicas sobre sus proveedores.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* CTA section */}
      <div className="bg-primary-700">
        <div className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:py-16 lg:px-8 lg:flex lg:items-center lg:justify-between">
          <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
            <span className="block">¿Listo para comenzar?</span>
            <span className="block text-primary-200">Regístrese hoy y evalúe sus primeros proveedores gratis.</span>
          </h2>
          <div className="mt-8 flex lg:mt-0 lg:flex-shrink-0">
            <div className="inline-flex rounded-md shadow">
              <Link to="/register" className="inline-flex items-center justify-center px-5 py-3 border border-transparent text-base font-medium rounded-md text-primary-600 bg-white hover:bg-gray-50">
                Crear cuenta
              </Link>
            </div>
            <div className="ml-3 inline-flex rounded-md shadow">
              <Link to="/login" className="inline-flex items-center justify-center px-5 py-3 border border-transparent text-base font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700">
                Iniciar sesión
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-white">
        <div className="max-w-7xl mx-auto py-12 px-4 overflow-hidden sm:px-6 lg:px-8">
          <div className="flex justify-center space-x-10">
            <a href="#" className="text-gray-400 hover:text-gray-500">
              <span className="sr-only">Facebook</span>
              <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path fillRule="evenodd" d="M22 12c0-5.523-4.477-10-10-10S2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.878v-6.987h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.988C18.343 21.128 22 16.991 22 12z" clipRule="evenodd" />
              </svg>
            </a>

            <a href="#" className="text-gray-400 hover:text-gray-500">
              <span className="sr-only">Instagram</span>
              <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path fillRule="evenodd" d="M12.315 2c2.43 0 2.784.013 3.808.06 1.064.049 1.791.218 2.427.465a4.902 4.902 0 011.772 1.153 4.902 4.902 0 011.153 1.772c.247.636.416 1.363.465 2.427.048 1.067.06 1.407.06 4.123v.08c0 2.643-.012 2.987-.06 4.043-.049 1.064-.218 1.791-.465 2.427a4.902 4.902 0 01-1.153 1.772 4.902 4.902 0 01-1.772 1.153c-.636.247-1.363.416-2.427.465-1.067.048-1.407.06-4.123.06h-.08c-2.643 0-2.987-.012-4.043-.06-1.064-.049-1.791-.218-2.427-.465a4.902 4.902 0 01-1.772-1.153 4.902 4.902 0 01-1.153-1.772c-.247-.636-.416-1.363-.465-2.427-.047-1.024-.06-1.379-.06-3.808v-.63c0-2.43.013-2.784.06-3.808.049-1.064.218-1.791.465-2.427a4.902 4.902 0 011.153-1.772A4.902 4.902 0 015.45 2.525c.636-.247 1.363-.416 2.427-.465C8.901 2.013 9.256 2 11.685 2h.63zm-.081 1.802h-.468c-2.456 0-2.784.011-3.807.058-.975.045-1.504.207-1.857.344-.467.182-.8.398-1.15.748-.35.35-.566.683-.748 1.15-.137.353-.3.882-.344 1.857-.047 1.023-.058 1.351-.058 3.807v.468c0 2.456.011 2.784.058 3.807.045.975.207 1.504.344 1.857.182.466.399.8.748 1.15.35.35.683.566 1.15.748.353.137.882.3 1.857.344 1.054.048 1.37.058 4.041.058h.08c2.597 0 2.917-.01 3.96-.058.976-.045 1.505-.207 1.858-.344.466-.182.8-.398 1.15-.748.35-.35.566-.683.748-1.15.137-.353.3-.882.344-1.857.048-1.055.058-1.37.058-4.041v-.08c0-2.597-.01-2.917-.058-3.96-.045-.976-.207-1.505-.344-1.858a3.097 3.097 0 00-.748-1.15 3.098 3.098 0 00-1.15-.748c-.353-.137-.882-.3-1.857-.344-1.023-.047-1.351-.058-3.807-.058zM12 6.865a5.135 5.135 0 110 10.27 5.135 5.135 0 010-10.27zm0 1.802a3.333 3.333 0 100 6.666 3.333 3.333 0 000-6.666zm5.338-3.205a1.2 1.2 0 110 2.4 1.2 1.2 0 010-2.4z" clipRule="evenodd" />
              </svg>
            </a>

            <a href="#" className="text-gray-400 hover:text-gray-500">
              <span className="sr-only">Twitter</span>
              <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M8.29 20.251c7.547 0 11.675-6.253 11.675-11.675 0-.178 0-.355-.012-.53A8.348 8.348 0 0022 5.92a8.19 8.19 0 01-2.357.646 4.118 4.118 0 001.804-2.27 8.224 8.224 0 01-2.605.996 4.107 4.107 0 00-6.993 3.743 11.65 11.65 0 01-8.457-4.287 4.106 4.106 0 001.27 5.477A4.072 4.072 0 012.8 9.713v.052a4.105 4.105 0 003.292 4.022 4.095 4.095 0 01-1.853.07 4.108 4.108 0 003.834 2.85A8.233 8.233 0 012 18.407a11.616 11.616 0 006.29 1.84" />
              </svg>
            </a>

            <a href="#" className="text-gray-400 hover:text-gray-500">
              <span className="sr-only">LinkedIn</span>
              <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path fillRule="evenodd" d="M4.98 3.5c0 1.381-1.11 2.5-2.48 2.5s-2.48-1.119-2.48-2.5c0-1.38 1.11-2.5 2.48-2.5s2.48 1.12 2.48 2.5zm.02 4.5h-5v16h5v-16zm7.982 0h-4.968v16h4.969v-8.399c0-4.67 6.029-5.052 6.029 0v8.399h4.988v-10.131c0-7.88-8.922-7.593-11.018-3.714v-2.155z" clipRule="evenodd" />
              </svg>
            </a>
          </div>

          <div className="mt-8">
            <p className="text-center text-base text-gray-400">
              &copy; 2025 Duxiter SPA. Todos los derechos reservados.
            </p>
          </div>

          <div className="mt-4 flex justify-center space-x-6">
            <a href="#" className="text-sm text-gray-500 hover:text-gray-900">
              Términos y condiciones
            </a>
            <a href="#" className="text-sm text-gray-500 hover:text-gray-900">
              Política de privacidad
            </a>
            <a href="#" className="text-sm text-gray-500 hover:text-gray-900">
              Contacto
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;